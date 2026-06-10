import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildKickoffFields, db, getTimezoneForCity, initDb, recalculateMatchPoints } from "./db.js";
import { requireAdmin, requireAuth, signToken } from "./auth.js";
import {
  loginSchema,
  matchSchema,
  predictionSchema,
  registerSchema,
  resultSchema
} from "./validation.js";

initDb();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "../../client/dist");
const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ugyldig registrering." });

  const { username, password } = parsed.data;
  const existing = db.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(username);
  if (existing) return res.status(409).json({ message: "Brukarnamnet er allereie teke." });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'USER')")
    .run(username, passwordHash);
  const user = db
    .prepare("SELECT id, username, role, created_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json({ token: signToken(user), user });
});

app.post("/api/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ugyldig innlogging." });

  const userWithPassword = db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?)")
    .get(parsed.data.username);

  if (!userWithPassword || !bcrypt.compareSync(parsed.data.password, userWithPassword.password_hash)) {
    return res.status(401).json({ message: "Feil brukarnamn eller passord." });
  }

  const user = {
    id: userWithPassword.id,
    username: userWithPassword.username,
    role: userWithPassword.role,
    created_at: userWithPassword.created_at
  };
  res.json({ token: signToken(user), user });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/matches", requireAuth, (req, res) => {
  const matches = db
    .prepare("SELECT * FROM matches ORDER BY COALESCE(match_number, 999), start_time ASC")
    .all();
  res.json({ matches: matches.map(mapMatch) });
});

app.get("/api/predictions/me", requireAuth, (req, res) => {
  const predictions = db
    .prepare("SELECT * FROM predictions WHERE user_id = ?")
    .all(req.user.id);
  res.json({ predictions: predictions.map(mapPrediction) });
});

app.get("/api/matches/:id/predictions", requireAuth, (req, res) => {
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id);
  if (!match) return res.status(404).json({ message: "Kampen finst ikkje." });
  if (!isMatchLocked(match)) {
    return res.status(423).json({ message: "Tipsa blir offentlege når kampen er låst." });
  }

  const predictions = db
    .prepare(
      `SELECT
         p.id,
         p.user_id,
         p.match_id,
         p.outcome,
         p.predicted_home_goals,
         p.predicted_away_goals,
         p.points,
         p.created_at,
         p.updated_at,
         u.username
       FROM predictions p
       JOIN users u ON u.id = p.user_id
       WHERE p.match_id = ?
       ORDER BY lower(u.username) ASC`
    )
    .all(req.params.id);

  res.json({ predictions: predictions.map(mapPublicPrediction) });
});

app.post("/api/predictions", requireAuth, (req, res) => {
  const parsed = predictionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ugyldig tips." });

  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(parsed.data.matchId);
  if (!match) return res.status(404).json({ message: "Kampen finst ikkje." });
  if (isMatchLocked(match)) {
    return res.status(423).json({ message: "Tips er låst etter kampstart." });
  }

  const existing = db
    .prepare("SELECT id FROM predictions WHERE user_id = ? AND match_id = ?")
    .get(req.user.id, parsed.data.matchId);

  if (existing) {
    db.prepare(
      `UPDATE predictions
       SET outcome = ?, predicted_home_goals = ?, predicted_away_goals = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      parsed.data.outcome,
      parsed.data.predictedHomeGoals,
      parsed.data.predictedAwayGoals,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO predictions
        (user_id, match_id, outcome, predicted_home_goals, predicted_away_goals)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      req.user.id,
      parsed.data.matchId,
      parsed.data.outcome,
      parsed.data.predictedHomeGoals,
      parsed.data.predictedAwayGoals
    );
  }

  const prediction = db
    .prepare("SELECT * FROM predictions WHERE user_id = ? AND match_id = ?")
    .get(req.user.id, parsed.data.matchId);

  res.json({ prediction: mapPrediction(prediction) });
});

app.get("/api/leaderboard", requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
         u.id,
         u.username,
         COALESCE(SUM(p.points), 0) AS total_points,
         COUNT(p.id) AS predictions_count,
         SUM(CASE WHEN p.points = 5 THEN 1 ELSE 0 END) AS perfect_tips,
         SUM(CASE WHEN p.points = 5 THEN 2 ELSE 0 END) AS bonus_points
       FROM users u
       LEFT JOIN predictions p ON p.user_id = u.id
       WHERE u.role != 'ADMIN'
       GROUP BY u.id
       ORDER BY total_points DESC, predictions_count DESC, lower(u.username) ASC`
    )
    .all();

  let previousPoints = null;
  let previousRank = 0;
  const leaderboard = rows.map((row, index) => {
    const rank = row.total_points === previousPoints ? previousRank : index + 1;
    previousPoints = row.total_points;
    previousRank = rank;
    return {
      rank,
      userId: row.id,
      username: row.username,
      totalPoints: row.total_points,
      predictionsCount: row.predictions_count,
      perfectTips: row.perfect_tips ?? 0,
      bonusPoints: row.bonus_points ?? 0
    };
  });

  res.json({ leaderboard });
});

app.post("/api/admin/matches", requireAuth, requireAdmin, (req, res) => {
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ugyldig kampdata." });
  const date = parsed.data.date ?? parsed.data.startTime.slice(0, 10);
  const localTime = parsed.data.localTime ?? parsed.data.startTime.slice(11, 16);
  const timezone = parsed.data.timezone ?? getTimezoneForCity(parsed.data.city);
  const kickoff = buildKickoffFields(date, localTime, timezone);

  const result = db
    .prepare(
      `INSERT INTO matches
        (match_number, home_team, away_team, start_time, match_date, local_time, timezone, kickoff_at_utc, stadium, group_name, city, stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.data.matchNumber ?? null,
      parsed.data.homeTeam,
      parsed.data.awayTeam,
      kickoff.start_time,
      kickoff.match_date,
      kickoff.local_time,
      kickoff.timezone,
      kickoff.kickoff_at_utc,
      parsed.data.stadium ?? null,
      parsed.data.groupName ?? null,
      parsed.data.city ?? null,
      parsed.data.stage ?? "Group Stage"
    );

  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ match: mapMatch(match) });
});

app.put("/api/admin/matches/:id", requireAuth, requireAdmin, (req, res) => {
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ugyldig kampdata." });
  const date = parsed.data.date ?? parsed.data.startTime.slice(0, 10);
  const localTime = parsed.data.localTime ?? parsed.data.startTime.slice(11, 16);
  const timezone = parsed.data.timezone ?? getTimezoneForCity(parsed.data.city);
  const kickoff = buildKickoffFields(date, localTime, timezone);

  const result = db
    .prepare(
      `UPDATE matches
       SET
         match_number = ?,
         home_team = ?,
         away_team = ?,
         start_time = ?,
         match_date = ?,
         local_time = ?,
         timezone = ?,
         kickoff_at_utc = ?,
         stadium = ?,
         group_name = ?,
         city = ?,
         stage = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(
      parsed.data.matchNumber ?? null,
      parsed.data.homeTeam,
      parsed.data.awayTeam,
      kickoff.start_time,
      kickoff.match_date,
      kickoff.local_time,
      kickoff.timezone,
      kickoff.kickoff_at_utc,
      parsed.data.stadium ?? null,
      parsed.data.groupName ?? null,
      parsed.data.city ?? null,
      parsed.data.stage ?? "Group Stage",
      req.params.id
    );

  if (result.changes === 0) return res.status(404).json({ message: "Kampen finst ikkje." });
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id);
  res.json({ match: mapMatch(match) });
});

app.put("/api/admin/matches/:id/result", requireAuth, requireAdmin, (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ugyldig resultat." });

  const result = db
    .prepare(
      `UPDATE matches
       SET home_score = ?, away_score = ?, status = 'FINISHED', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(parsed.data.homeScore, parsed.data.awayScore, req.params.id);

  if (result.changes === 0) return res.status(404).json({ message: "Kampen finst ikkje." });

  recalculateMatchPoints(req.params.id);
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id);
  res.json({ match: mapMatch(match) });
});

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Noko gjekk gale på serveren." });
});

app.listen(port, () => {
  console.log(`VM-tippe API køyrer på http://localhost:${port}`);
});

function mapMatch(match) {
  const predictionDeadline = getPredictionDeadline(match);

  return {
    id: match.id,
    matchNumber: match.match_number,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    startTime: match.start_time,
    kickoffAtUtc: match.kickoff_at_utc ?? match.start_time,
    date: match.match_date,
    localTime: match.local_time,
    timezone: match.timezone,
    stadium: match.stadium,
    groupName: match.group_name,
    city: match.city,
    stage: match.stage,
    homeScore: match.home_score,
    awayScore: match.away_score,
    status: match.status,
    predictionDeadline: predictionDeadline.toISOString(),
    serverTime: new Date().toISOString(),
    isLocked: isMatchLocked(match)
  };
}

function isMatchLocked(match) {
  return Date.now() >= getPredictionDeadline(match).getTime();
}

function getPredictionDeadline(match) {
  const kickoffTime = new Date(match.kickoff_at_utc ?? match.start_time);
  return new Date(kickoffTime.getTime() - 10 * 60 * 1000);
}

function mapPrediction(prediction) {
  return {
    id: prediction.id,
    userId: prediction.user_id,
    matchId: prediction.match_id,
    outcome: prediction.outcome,
    predictedHomeGoals: prediction.predicted_home_goals,
    predictedAwayGoals: prediction.predicted_away_goals,
    points: prediction.points,
    createdAt: prediction.created_at,
    updatedAt: prediction.updated_at
  };
}

function mapPublicPrediction(prediction) {
  return {
    id: prediction.id,
    userId: prediction.user_id,
    username: prediction.username,
    matchId: prediction.match_id,
    outcome: prediction.outcome,
    predictedHomeGoals: prediction.predicted_home_goals,
    predictedAwayGoals: prediction.predicted_away_goals,
    points: prediction.points,
    createdAt: prediction.created_at,
    updatedAt: prediction.updated_at
  };
}
