import { many, query, recalculateMatchPoints } from "./db.js";

const ONE_HOUR = 60 * 60 * 1000;
const provider = process.env.FOOTBALL_API_PROVIDER?.trim().toLowerCase();
const apiKey = process.env.FOOTBALL_API_KEY?.trim();
const baseUrl = process.env.FOOTBALL_API_BASE_URL?.trim();
const scoreSyncEnabled = process.env.FOOTBALL_SCORE_SYNC_ENABLED === "true";
const competitionId =
  process.env.FOOTBALL_API_COMPETITION_ID?.trim() ??
  (provider === "api-football" || provider === "apisports" ? "1" : null) ??
  (provider === "football-data" || provider === "football-data.org" ? "WC" : null);
const season = process.env.FOOTBALL_API_SEASON?.trim() ?? "2026";
const livePollMs = Number(process.env.FOOTBALL_SCORE_LIVE_POLL_MS ?? 30000);
const idlePollMs = Number(process.env.FOOTBALL_SCORE_IDLE_POLL_MS ?? 300000);
const noMatchesPollMs = ONE_HOUR;
const apiFootballBaseUrl = "https://v3.football.api-sports.io";

let syncInProgress = false;
let timeoutId = null;

export function startScorePolling() {
  if (!scoreSyncEnabled) {
    console.log("[scores] disabled by configuration");
    return;
  }

  if (!provider || !apiKey || !baseUrl) {
    console.log("[scores] Automatic score polling disabled. Set FOOTBALL_API_PROVIDER, FOOTBALL_API_KEY and FOOTBALL_API_BASE_URL.");
    return;
  }

  console.log(`[scores] provider: ${provider}`);
  console.log(`[scores] base URL: ${sanitizeUrl(baseUrl)}`);
  console.log(`[scores] competition ID: ${competitionId ?? "strict-name-filter"}`);
  console.log(`[scores] season: ${season}`);
  console.log(
    `[scores] Starting ${provider} score polling. idle=${Math.round(idlePollMs / 1000)}s live=${Math.round(
      livePollMs / 1000
    )}s noMatches=${Math.round(noMatchesPollMs / 1000)}s competition=${competitionId ?? "strict-name-filter"} season=${season}.`
  );

  scheduleNextSync(0);
}

export async function syncScores() {
  if (!scoreSyncEnabled) {
    console.log("[scores] disabled by configuration");
    return;
  }

  if (syncInProgress) {
    console.log("[scores] Previous sync still running, skipping this tick.");
    scheduleNextSync(idlePollMs);
    return;
  }

  syncInProgress = true;
  try {
    const today = currentDate();
    const localMatches = await loadLocalMatchesForDate(today);

    if (localMatches.length === 0) {
      console.log("[scores] no matches today");
      scheduleNextSync(noMatchesPollMs);
      return;
    }

    const hasLiveBeforeFetch = localMatches.some((match) => match.status === "LIVE");
    console.log(hasLiveBeforeFetch ? "[scores] live polling every 30s" : "[scores] idle polling every 5m");

    console.log("[scores] fetching FIFA World Cup fixtures only");
    const response = await requestFixtures();
    if (!response.ok) {
      throw new Error(`Football API returned ${response.statusCode}`);
    }
    const apiFixtures = response.fixtures;

    const worldCupFixtures = apiFixtures.filter(isWorldCupFixture);
    const updates = matchFixtures(localMatches, worldCupFixtures);
    console.log(
      `[scores] Fetched ${apiFixtures.length} fixtures for ${today}, kept ${worldCupFixtures.length} FIFA World Cup fixtures, matched ${updates.length} local matches.`
    );

    for (const { match, fixture } of updates) {
      await updateMatchFromFixture(match, fixture);
    }

    const latestTodayMatches = await loadLocalMatchesForDate(today);
    const hasLiveAfterFetch = latestTodayMatches.some((match) => match.status === "LIVE");

    if (hasLiveAfterFetch) {
      scheduleNextSync(livePollMs);
      return;
    }

    scheduleNextSync(idlePollMs);
  } catch (error) {
    console.error("[scores] Score sync failed:", error);
    scheduleNextSync(idlePollMs);
  } finally {
    syncInProgress = false;
  }
}

function scheduleNextSync(delayMs) {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    syncScores().catch((error) => console.error("[scores] Score sync failed:", error));
  }, delayMs);
}

async function loadLocalMatchesForDate(date) {
  return many(
    `SELECT id, match_number, home_team, away_team, match_date, start_time, home_score, away_score, status
     FROM matches
     WHERE match_date = $1
     ORDER BY start_time ASC`,
    [date]
  );
}

export async function testScoreSync() {
  if (!scoreSyncEnabled) return disabledScoreSyncResponse();

  const response = await requestFixtures();

  return {
    provider,
    baseUrl: sanitizeUrl(baseUrl),
    competitionId,
    season,
    statusCode: response.statusCode,
    fixtureCount: response.responseLength,
    results: response.results,
    errors: response.errors,
    sampleCompetition: response.rawFixtures[0]?.league?.name ?? null,
    sampleFixture: formatSampleFixture(response.rawFixtures[0]),
    fixtures: response.rawFixtures.slice(0, 2)
  };
}

export async function rawTestScoreSync() {
  if (!scoreSyncEnabled) return disabledScoreSyncResponse();

  const response = await requestFixtures();

  return {
    statusCode: response.statusCode,
    results: response.results,
    errors: response.errors,
    responseLength: response.responseLength,
    fixtures: response.rawFixtures.slice(0, 2)
  };
}

function disabledScoreSyncResponse() {
  console.log("[scores] disabled by configuration");
  return {
    enabled: false,
    message: "Score sync is disabled by FOOTBALL_SCORE_SYNC_ENABLED."
  };
}

async function requestFixtures() {
  const url = buildFixtureUrl();
  console.log(`[scores] requesting: ${sanitizeUrl(url)}`);

  const response = await fetch(url, {
    headers: buildHeaders()
  });
  console.log(`[scores] response status: ${response.status}`);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[scores] response body: ${body}`);
    return {
      ok: false,
      statusCode: response.status,
      results: null,
      errors: body,
      fixtures: [],
      rawFixtures: [],
      competitionNames: [],
      firstFixtureDate: null,
      responseLength: 0
    };
  }

  const data = await response.json();
  logJsonShape(data);
  const rawFixtures = Array.isArray(data.response) ? data.response : [];
  const fixtures = normalizeFixtures(data);
  const competitionNames = [...new Set(fixtures.map((fixture) => fixture.competitionName).filter(Boolean))];
  const firstFixtureDate = fixtures[0]?.date ?? null;
  const errors = readApiErrors(data);
  const results = readApiResults(data);
  const responseLength = rawFixtures.length;

  console.log(`[scores] fixture count returned: ${responseLength}`);
  console.log(`[scores] competition names returned: ${competitionNames.length ? competitionNames.join(", ") : "-"}`);
  console.log(`[scores] first fixture date: ${firstFixtureDate ?? "-"}`);
  if (hasApiErrors(errors)) {
    console.error(`[scores] API errors: ${JSON.stringify(errors)}`);
  }

  return {
    ok: true,
    statusCode: response.status,
    results,
    errors,
    fixtures,
    rawFixtures,
    competitionNames,
    firstFixtureDate,
    responseLength
  };
}

function buildFixtureUrl() {
  if (provider === "api-football" || provider === "apisports") {
    const url = new URL("/fixtures", apiFootballBaseUrl);
    url.searchParams.set("league", competitionId ?? "1");
    url.searchParams.set("season", season);
    return url.toString();
  }

  const url = new URL(baseUrl);
  if (provider === "football-data" || provider === "football-data.org") {
    if (competitionId && !url.pathname.includes("/competitions/")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/competitions/${competitionId}/matches`;
    }
  } else {
    if (competitionId) url.searchParams.set("league", competitionId);
    if (season) url.searchParams.set("season", season);
  }
  return url.toString();
}

function logJsonShape(data) {
  const responseValue = data?.response;
  const responseLength = Array.isArray(responseValue) ? responseValue.length : 0;
  const firstFixture = Array.isArray(responseValue) ? responseValue[0] : null;
  const shape = {
    keys: data && typeof data === "object" ? Object.keys(data) : [],
    results: data?.results ?? null,
    responseLength,
    errors: data?.errors ?? null,
    firstFixtureKeys: firstFixture && typeof firstFixture === "object" ? Object.keys(firstFixture) : []
  };

  console.log(`[scores] API-Football JSON shape: ${JSON.stringify(shape)}`);
}

function readApiResults(data) {
  if (provider === "api-football" || provider === "apisports") {
    return data?.results ?? null;
  }
  return null;
}

function readApiErrors(data) {
  return data?.errors ?? null;
}

function hasApiErrors(errors) {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

function formatSampleFixture(fixture) {
  if (!fixture) return null;
  const homeTeam = fixture.teams?.home?.name ?? fixture.homeTeam ?? fixture.home_team;
  const awayTeam = fixture.teams?.away?.name ?? fixture.awayTeam ?? fixture.away_team;
  if (!homeTeam || !awayTeam) return null;
  return `${homeTeam} vs ${awayTeam}`;
}

function sanitizeUrl(urlValue) {
  if (!urlValue) return urlValue;

  try {
    const url = new URL(urlValue);
    for (const key of ["key", "api_key", "apikey", "api-key", "token", "auth_token", "x-apisports-key"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return urlValue.replace(
      /([?&](?:key|api_key|apikey|api-key|token|auth_token|x-apisports-key)=)[^&{}]+/gi,
      "$1[redacted]"
    );
  }
}

function buildHeaders() {
  if (provider === "api-football" || provider === "apisports") {
    return { "x-apisports-key": process.env.FOOTBALL_API_KEY };
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
      kickoffAt: fixture.fixture?.date,
      homeTeam: fixture.teams?.home?.name,
      awayTeam: fixture.teams?.away?.name,
      homeScore: numberOrNull(fixture.goals?.home),
      awayScore: numberOrNull(fixture.goals?.away),
      status: mapApiFootballStatus(fixture.fixture?.status?.short),
      competitionId: fixture.league?.id ? String(fixture.league.id) : null,
      competitionSeason: fixture.league?.season ? String(fixture.league.season) : null,
      competitionName: fixture.league?.name
    }));
  }

  if (provider === "football-data" || provider === "football-data.org") {
    return (data.matches ?? []).map((match) => ({
      matchNumber: readMatchNumber(match),
      date: match.utcDate?.slice(0, 10),
      kickoffAt: match.utcDate,
      homeTeam: match.homeTeam?.name,
      awayTeam: match.awayTeam?.name,
      homeScore: numberOrNull(match.score?.fullTime?.home ?? match.score?.regularTime?.home),
      awayScore: numberOrNull(match.score?.fullTime?.away ?? match.score?.regularTime?.away),
      status: mapFootballDataStatus(match.status),
      competitionId: match.competition?.code ?? (match.competition?.id ? String(match.competition.id) : null),
      competitionSeason: null,
      competitionName: match.competition?.name
    }));
  }

  const fixtures = Array.isArray(data) ? data : data.fixtures ?? data.matches ?? [];
  return fixtures.map((fixture) => ({
    matchNumber: readMatchNumber(fixture),
    date: fixture.date?.slice(0, 10) ?? fixture.utcDate?.slice(0, 10),
    kickoffAt: fixture.kickoffAt ?? fixture.kickoff_at ?? fixture.utcDate ?? fixture.date,
    homeTeam: fixture.homeTeam ?? fixture.home_team ?? fixture.home?.name,
    awayTeam: fixture.awayTeam ?? fixture.away_team ?? fixture.away?.name,
    homeScore: numberOrNull(fixture.homeScore ?? fixture.home_score ?? fixture.score?.home),
    awayScore: numberOrNull(fixture.awayScore ?? fixture.away_score ?? fixture.score?.away),
    status: normalizeStatus(fixture.status),
    competitionId: fixture.competitionId ?? fixture.competition_id ?? fixture.leagueId ?? fixture.league_id ?? null,
    competitionSeason: fixture.competitionSeason ?? fixture.competition_season ?? fixture.leagueSeason ?? fixture.league_season ?? null,
    competitionName: fixture.competitionName ?? fixture.competition_name ?? fixture.leagueName ?? fixture.league_name
  }));
}

function isWorldCupFixture(fixture) {
  return String(fixture.competitionId) === String(competitionId) && String(fixture.competitionSeason) === String(season);
}

function matchFixtures(localMatches, apiFixtures) {
  const byMatchNumber = new Map();
  const byTeams = new Map();

  for (const fixture of apiFixtures) {
    if (fixture.matchNumber) byMatchNumber.set(Number(fixture.matchNumber), fixture);
    if (fixture.date && fixture.homeTeam && fixture.awayTeam) {
      const key = buildTeamsKey(fixture.homeTeam, fixture.awayTeam);
      const existing = byTeams.get(key) ?? [];
      existing.push(fixture);
      byTeams.set(key, existing);
    }
  }

  return localMatches
    .map((match) => {
      const fixture =
        (match.match_number ? byMatchNumber.get(Number(match.match_number)) : null) ??
        findTeamFixture(byTeams.get(buildTeamsKey(match.home_team, match.away_team)), match);

      return fixture ? { match, fixture } : null;
    })
    .filter(Boolean);
}

function findTeamFixture(fixtures = [], match) {
  if (fixtures.length === 0) return null;
  const matchTime = new Date(match.start_time).getTime();
  const closeFixture = fixtures.find((fixture) => {
    const fixtureTime = new Date(fixture.kickoffAt ?? fixture.date).getTime();
    if (!Number.isFinite(matchTime) || !Number.isFinite(fixtureTime)) return false;
    return Math.abs(matchTime - fixtureTime) <= 36 * 60 * 60 * 1000;
  });

  return closeFixture ?? fixtures[0];
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

function currentDate() {
  return new Date().toISOString().slice(0, 10);
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

function buildTeamsKey(homeTeam, awayTeam) {
  return `${normalizeTeam(homeTeam)}|${normalizeTeam(awayTeam)}`;
}

function normalizeTeam(team) {
  const normalized = String(team ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const aliases = {
    czechrepublic: "czechia",
    korearepublic: "southkorea",
    usa: "unitedstates",
    unitedstatesofamerica: "unitedstates",
    cotedivoire: "ivorycoast",
    turkiye: "turkey",
    curacao: "curacao"
  };

  return aliases[normalized] ?? normalized;
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
