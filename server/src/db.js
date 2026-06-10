import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculatePredictionPoints } from "./scoring.js";
import { worldCup2026GroupMatches } from "./data/worldCup2026GroupMatches.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "vm-tippe.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_number INTEGER UNIQUE,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      start_time TEXT NOT NULL,
      match_date TEXT,
      local_time TEXT,
      timezone TEXT,
      kickoff_at_utc TEXT,
      stadium TEXT,
      group_name TEXT,
      city TEXT,
      stage TEXT NOT NULL DEFAULT 'Group Stage',
      home_score INTEGER,
      away_score INTEGER,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('HOME', 'DRAW', 'AWAY')),
      predicted_home_goals INTEGER NOT NULL,
      predicted_away_goals INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, match_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );
  `);

  migrateMatchesTable();
  seedUsers();
  seedMatches();
  recalculateAllPoints();
}

function migrateMatchesTable() {
  const columns = db.prepare("PRAGMA table_info(matches)").all().map((column) => column.name);
  const migrations = [
    ["match_number", "ALTER TABLE matches ADD COLUMN match_number INTEGER"],
    ["match_date", "ALTER TABLE matches ADD COLUMN match_date TEXT"],
    ["local_time", "ALTER TABLE matches ADD COLUMN local_time TEXT"],
    ["timezone", "ALTER TABLE matches ADD COLUMN timezone TEXT"],
    ["kickoff_at_utc", "ALTER TABLE matches ADD COLUMN kickoff_at_utc TEXT"],
    ["city", "ALTER TABLE matches ADD COLUMN city TEXT"],
    ["stage", "ALTER TABLE matches ADD COLUMN stage TEXT NOT NULL DEFAULT 'Group Stage'"]
  ];

  for (const [column, statement] of migrations) {
    if (!columns.includes(column)) {
      db.exec(statement);
    }
  }

  db.exec("DROP INDEX IF EXISTS idx_matches_match_number");
  db.exec("CREATE UNIQUE INDEX idx_matches_match_number ON matches(match_number)");
}

function seedUsers() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;

  const insert = db.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
  );
  insert.run("admin", bcrypt.hashSync("admin123", 10), "ADMIN");
  insert.run("demo", bcrypt.hashSync("demo123", 10), "USER");
}

function seedMatches() {
  const insert = db.prepare(`
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
      (
        @match_number,
        @home_team,
        @away_team,
        @start_time,
        @match_date,
        @local_time,
        @timezone,
        @kickoff_at_utc,
        @stadium,
        @group_name,
        @city,
        @stage,
        NULL,
        NULL,
        'SCHEDULED'
      )
    ON CONFLICT(match_number) DO UPDATE SET
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      start_time = excluded.start_time,
      match_date = excluded.match_date,
      local_time = excluded.local_time,
      timezone = excluded.timezone,
      kickoff_at_utc = excluded.kickoff_at_utc,
      stadium = excluded.stadium,
      group_name = excluded.group_name,
      city = excluded.city,
      stage = excluded.stage,
      updated_at = CURRENT_TIMESTAMP
  `);

  const seedRows = worldCup2026GroupMatches.map((match) => ({
    ...buildKickoffFields(match.date, match.localTime, getTimezoneForCity(match.city)),
    match_number: match.matchNumber,
    home_team: match.homeTeam,
    away_team: match.awayTeam,
    stadium: match.stadium,
    group_name: match.group,
    city: match.city,
    stage: match.stage
  }));

  const tx = db.transaction((rows) => {
    db.prepare(
      `DELETE FROM predictions
       WHERE match_id IN (SELECT id FROM matches WHERE match_number IS NULL)`
    ).run();
    db.prepare("DELETE FROM matches WHERE match_number IS NULL").run();

    rows.forEach((row) => insert.run(row));
  });
  tx(seedRows);
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

export function recalculateAllPoints() {
  const predictions = db
    .prepare(
      `SELECT p.*, m.home_score, m.away_score
       FROM predictions p
       JOIN matches m ON m.id = p.match_id`
    )
    .all();

  const update = db.prepare("UPDATE predictions SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  const tx = db.transaction((rows) => {
    for (const prediction of rows) {
      update.run(calculatePredictionPoints(prediction, prediction), prediction.id);
    }
  });
  tx(predictions);
}

export function recalculateMatchPoints(matchId) {
  const rows = db
    .prepare(
      `SELECT p.*, m.home_score, m.away_score
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
       WHERE p.match_id = ?`
    )
    .all(matchId);

  const update = db.prepare("UPDATE predictions SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  const tx = db.transaction((predictions) => {
    for (const prediction of predictions) {
      update.run(calculatePredictionPoints(prediction, prediction), prediction.id);
    }
  });
  tx(rows);
}
