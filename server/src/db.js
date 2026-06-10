import pg from "pg";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { calculatePredictionPoints } from "./scoring.js";
import { worldCup2026GroupMatches } from "./data/worldCup2026GroupMatches.js";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL manglar. Set denne til Supabase PostgreSQL connection string.");
}

const sslEnabled = process.env.DB_SSL !== "false";

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function one(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] ?? null;
}

export async function many(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      match_number INTEGER UNIQUE,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      match_date DATE,
      local_time TEXT,
      timezone TEXT,
      kickoff_at_utc TIMESTAMPTZ,
      stadium TEXT,
      group_name TEXT,
      city TEXT,
      stage TEXT NOT NULL DEFAULT 'Group Stage',
      home_score INTEGER,
      away_score INTEGER,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      outcome TEXT NOT NULL CHECK(outcome IN ('HOME', 'DRAW', 'AWAY')),
      predicted_home_goals INTEGER NOT NULL,
      predicted_away_goals INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, match_id)
    );

    CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
    CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
  `);

  await seedUsers();
  await seedMatches();
  await recalculateAllPoints();
}

async function seedUsers() {
  const row = await one("SELECT COUNT(*)::int AS count FROM users");
  if (row.count > 0) return;

  await query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3), ($4, $5, $6)",
    [
      "admin",
      bcrypt.hashSync(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
      "ADMIN",
      "demo",
      bcrypt.hashSync(process.env.SEED_DEMO_PASSWORD ?? "demo123", 10),
      "USER"
    ]
  );
}

async function seedMatches() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      DELETE FROM predictions
      WHERE match_id IN (SELECT id FROM matches WHERE match_number IS NULL)
    `);
    await client.query("DELETE FROM matches WHERE match_number IS NULL");

    for (const match of worldCup2026GroupMatches) {
      const kickoff = buildKickoffFields(match.date, match.localTime, getTimezoneForCity(match.city));
      await client.query(
        `
          INSERT INTO matches
            (
              match_number,
              home_team,
              away_team,
              start_time,
              match_date,
              local_time,
              timezone,
              kickoff_at_utc,
              stadium,
              group_name,
              city,
              stage,
              home_score,
              away_score,
              status
            )
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, NULL, 'SCHEDULED')
          ON CONFLICT(match_number) DO UPDATE SET
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            start_time = EXCLUDED.start_time,
            match_date = EXCLUDED.match_date,
            local_time = EXCLUDED.local_time,
            timezone = EXCLUDED.timezone,
            kickoff_at_utc = EXCLUDED.kickoff_at_utc,
            stadium = EXCLUDED.stadium,
            group_name = EXCLUDED.group_name,
            city = EXCLUDED.city,
            stage = EXCLUDED.stage,
            updated_at = NOW()
        `,
        [
          match.matchNumber,
          match.homeTeam,
          match.awayTeam,
          kickoff.start_time,
          kickoff.match_date,
          kickoff.local_time,
          kickoff.timezone,
          kickoff.kickoff_at_utc,
          match.stadium,
          match.group,
          match.city,
          match.stage
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function buildKickoffFields(date, localTime, timezone) {
  const kickoff = DateTime.fromISO(`${date}T${localTime}`, { zone: timezone });
  if (!kickoff.isValid) {
    throw new Error(`Invalid kickoff time: ${date} ${localTime} ${timezone}`);
  }

  return {
    start_time: kickoff.toUTC().toISO(),
    match_date: date,
    local_time: localTime,
    timezone,
    kickoff_at_utc: kickoff.toUTC().toISO()
  };
}

export function getTimezoneForCity(city) {
  const timezones = {
    "New York/New Jersey": "America/New_York",
    Philadelphia: "America/New_York",
    Boston: "America/New_York",
    Miami: "America/New_York",
    Atlanta: "America/New_York",
    Toronto: "America/Toronto",
    Dallas: "America/Chicago",
    Houston: "America/Chicago",
    "Kansas City": "America/Chicago",
    "Mexico City": "America/Mexico_City",
    Monterrey: "America/Monterrey",
    Guadalajara: "America/Mexico_City",
    "Los Angeles": "America/Los_Angeles",
    "San Francisco Bay Area": "America/Los_Angeles",
    Seattle: "America/Los_Angeles",
    Vancouver: "America/Vancouver"
  };

  const timezone = timezones[city];
  if (!timezone) {
    throw new Error(`Missing timezone for city: ${city}`);
  }
  return timezone;
}

export async function recalculateAllPoints() {
  const predictions = await many(
    `SELECT p.*, m.home_score, m.away_score
     FROM predictions p
     JOIN matches m ON m.id = p.match_id`
  );

  for (const prediction of predictions) {
    await query("UPDATE predictions SET points = $1, updated_at = NOW() WHERE id = $2", [
      calculatePredictionPoints(prediction, prediction),
      prediction.id
    ]);
  }
}

export async function recalculateMatchPoints(matchId) {
  const predictions = await many(
    `SELECT p.*, m.home_score, m.away_score
     FROM predictions p
     JOIN matches m ON m.id = p.match_id
     WHERE p.match_id = $1`,
    [matchId]
  );

  for (const prediction of predictions) {
    await query("UPDATE predictions SET points = $1, updated_at = NOW() WHERE id = $2", [
      calculatePredictionPoints(prediction, prediction),
      prediction.id
    ]);
  }
}
