import { many, query, recalculateMatchPoints } from "./db.js";

const FIVE_MINUTES = 5 * 60 * 1000;
const provider = process.env.FOOTBALL_API_PROVIDER?.trim().toLowerCase();
const apiKey = process.env.FOOTBALL_API_KEY?.trim();
const baseUrl = process.env.FOOTBALL_API_BASE_URL?.trim();
const pollIntervalMs = Number(process.env.FOOTBALL_SCORE_POLL_MS ?? FIVE_MINUTES);

let syncInProgress = false;

export function startScorePolling() {
  if (!provider || !apiKey || !baseUrl) {
    console.log("[scores] Automatic score polling disabled. Set FOOTBALL_API_PROVIDER, FOOTBALL_API_KEY and FOOTBALL_API_BASE_URL.");
    return;
  }

  console.log(`[scores] Starting ${provider} score polling every ${Math.round(pollIntervalMs / 1000)} seconds.`);
  syncScores().catch((error) => console.error("[scores] Initial score sync failed:", error));
  setInterval(() => {
    syncScores().catch((error) => console.error("[scores] Score sync failed:", error));
  }, pollIntervalMs);
}

export async function syncScores() {
  if (syncInProgress) {
    console.log("[scores] Previous sync still running, skipping this tick.");
    return;
  }

  syncInProgress = true;
  try {
    const [localMatches, apiFixtures] = await Promise.all([loadLocalMatches(), fetchFixtures()]);
    const updates = matchFixtures(localMatches, apiFixtures);

    console.log(`[scores] Fetched ${apiFixtures.length} fixtures, matched ${updates.length} local matches.`);

    for (const { match, fixture } of updates) {
      await updateMatchFromFixture(match, fixture);
    }
  } finally {
    syncInProgress = false;
  }
}

async function loadLocalMatches() {
  return many(
    `SELECT id, match_number, home_team, away_team, match_date, start_time, home_score, away_score, status
     FROM matches
     ORDER BY start_time ASC`
  );
}

async function fetchFixtures() {
  const response = await fetch(baseUrl, {
    headers: buildHeaders()
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Football API returned ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return normalizeFixtures(data);
}

function buildHeaders() {
  if (provider === "api-football" || provider === "apisports") {
    return { "x-apisports-key": apiKey };
  }

  if (provider === "football-data" || provider === "football-data.org") {
    return { "X-Auth-Token": apiKey };
  }

  return { Authorization: `Bearer ${apiKey}` };
}

function normalizeFixtures(data) {
  if (provider === "api-football" || provider === "apisports") {
    return (data.response ?? []).map((fixture) => ({
      matchNumber: readMatchNumber(fixture),
      date: fixture.fixture?.date?.slice(0, 10),
      homeTeam: fixture.teams?.home?.name,
      awayTeam: fixture.teams?.away?.name,
      homeScore: numberOrNull(fixture.goals?.home),
      awayScore: numberOrNull(fixture.goals?.away),
      status: mapApiFootballStatus(fixture.fixture?.status?.short)
    }));
  }

  if (provider === "football-data" || provider === "football-data.org") {
    return (data.matches ?? []).map((match) => ({
      matchNumber: readMatchNumber(match),
      date: match.utcDate?.slice(0, 10),
      homeTeam: match.homeTeam?.name,
      awayTeam: match.awayTeam?.name,
      homeScore: numberOrNull(match.score?.fullTime?.home ?? match.score?.regularTime?.home),
      awayScore: numberOrNull(match.score?.fullTime?.away ?? match.score?.regularTime?.away),
      status: mapFootballDataStatus(match.status)
    }));
  }

  const fixtures = Array.isArray(data) ? data : data.fixtures ?? data.matches ?? [];
  return fixtures.map((fixture) => ({
    matchNumber: readMatchNumber(fixture),
    date: fixture.date?.slice(0, 10) ?? fixture.utcDate?.slice(0, 10),
    homeTeam: fixture.homeTeam ?? fixture.home_team ?? fixture.home?.name,
    awayTeam: fixture.awayTeam ?? fixture.away_team ?? fixture.away?.name,
    homeScore: numberOrNull(fixture.homeScore ?? fixture.home_score ?? fixture.score?.home),
    awayScore: numberOrNull(fixture.awayScore ?? fixture.away_score ?? fixture.score?.away),
    status: normalizeStatus(fixture.status)
  }));
}

function matchFixtures(localMatches, apiFixtures) {
  const byMatchNumber = new Map();
  const byDateTeams = new Map();

  for (const fixture of apiFixtures) {
    if (fixture.matchNumber) byMatchNumber.set(Number(fixture.matchNumber), fixture);
    if (fixture.date && fixture.homeTeam && fixture.awayTeam) {
      byDateTeams.set(buildDateTeamsKey(fixture.date, fixture.homeTeam, fixture.awayTeam), fixture);
    }
  }

  return localMatches
    .map((match) => {
      const fixture =
        (match.match_number ? byMatchNumber.get(Number(match.match_number)) : null) ??
        byDateTeams.get(buildDateTeamsKey(formatDate(match.match_date ?? match.start_time), match.home_team, match.away_team));

      return fixture ? { match, fixture } : null;
    })
    .filter(Boolean);
}

async function updateMatchFromFixture(match, fixture) {
  const nextStatus = normalizeStatus(fixture.status);
  const nextHomeScore = fixture.homeScore;
  const nextAwayScore = fixture.awayScore;

  if (!nextStatus || (nextHomeScore === null && nextAwayScore === null && nextStatus === match.status)) {
    return;
  }

  const scoreChanged = nextHomeScore !== match.home_score || nextAwayScore !== match.away_score;
  const statusChanged = nextStatus !== match.status;
  if (!scoreChanged && !statusChanged) return;

  await query(
    `UPDATE matches
     SET home_score = $1,
         away_score = $2,
         status = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [nextHomeScore, nextAwayScore, nextStatus, match.id]
  );

  console.log(
    `[scores] Updated #${match.match_number ?? match.id} ${match.home_team} - ${match.away_team}: ` +
      `${nextHomeScore ?? "-"}-${nextAwayScore ?? "-"} ${nextStatus}`
  );

  if (nextStatus === "FINISHED" && (match.status !== "FINISHED" || scoreChanged)) {
    await recalculateMatchPoints(match.id);
    console.log(`[scores] Recalculated prediction points for match #${match.match_number ?? match.id}.`);
  }
}

function readMatchNumber(fixture) {
  return fixture.matchNumber ?? fixture.match_number ?? null;
}

function mapApiFootballStatus(status) {
  if (["FT", "AET", "PEN"].includes(status)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"].includes(status)) return "LIVE";
  return "SCHEDULED";
}

function mapFootballDataStatus(status) {
  if (status === "FINISHED") return "FINISHED";
  if (["IN_PLAY", "PAUSED"].includes(status)) return "LIVE";
  return "SCHEDULED";
}

function normalizeStatus(status) {
  if (!status) return null;
  const normalized = String(status).toUpperCase();
  if (["FINISHED", "FT", "AET", "PEN"].includes(normalized)) return "FINISHED";
  if (["LIVE", "IN_PLAY", "PAUSED", "1H", "HT", "2H", "ET"].includes(normalized)) return "LIVE";
  return "SCHEDULED";
}

function buildDateTeamsKey(date, homeTeam, awayTeam) {
  return `${formatDate(date)}|${normalizeTeam(homeTeam)}|${normalizeTeam(awayTeam)}`;
}

function normalizeTeam(team) {
  return String(team ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function formatDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
