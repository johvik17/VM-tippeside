import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildKickoffFields, getTimezoneForCity, initDb, many, one, query, recalculateMatchPoints } from "./db.js";
import { requireAdmin, requireAuth, signToken } from "./auth.js";
import {
  loginSchema,
  matchSchema,
  predictionSchema,
  registerSchema,
  resultSchema
} from "./validation.js";

await initDb();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "../../client/dist");
const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ugyldig registrering." });

    const { username, password } = parsed.data;
    const existing = await one("SELECT id FROM users WHERE lower(username) = lower($1)", [username]);
    if (existing) return res.status(409).json({ message: "Brukarnamnet er allereie teke." });

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = await one(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'USER')
       RETURNING id, username, role, created_at`,
      [username, passwordHash]
    );

    res.status(201).json({ token: signToken(user), user });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ugyldig innlogging." });

    const userWithPassword = await one("SELECT * FROM users WHERE lower(username) = lower($1)", [
      parsed.data.username
    ]);

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
  })
);

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get(
  "/api/matches",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const matches = await many("SELECT * FROM matches ORDER BY COALESCE(match_number, 999), start_time ASC");
    res.json({ matches: matches.map(mapMatch) });
  })
);

app.get(
  "/api/predictions/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const predictions = await many("SELECT * FROM predictions WHERE user_id = $1", [req.user.id]);
    res.json({ predictions: predictions.map(mapPrediction) });
  })
);

app.get(
  "/api/matches/:id/predictions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const match = await one("SELECT * FROM matches WHERE id = $1", [req.params.id]);
    if (!match) return res.status(404).json({ message: "Kampen finst ikkje." });
    if (!isMatchLocked(match)) {
      return res.status(423).json({ message: "Tipsa blir offentlege når kampen er låst." });
    }

    const predictions = await many(
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
       WHERE p.match_id = $1
       ORDER BY lower(u.username) ASC`,
      [req.params.id]
    );

    res.json({ predictions: predictions.map(mapPublicPrediction) });
  })
);

app.post(
  "/api/predictions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = predictionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ugyldig tips." });

    const match = await one("SELECT * FROM matches WHERE id = $1", [parsed.data.matchId]);
    if (!match) return res.status(404).json({ message: "Kampen finst ikkje." });
    if (isMatchLocked(match)) {
      return res.status(423).json({ message: "Tips er låst etter kampstart." });
    }

    const prediction = await one(
      `INSERT INTO predictions
        (user_id, match_id, outcome, predicted_home_goals, predicted_away_goals)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(user_id, match_id) DO UPDATE SET
         outcome = EXCLUDED.outcome,
         predicted_home_goals = EXCLUDED.predicted_home_goals,
         predicted_away_goals = EXCLUDED.predicted_away_goals,
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.id,
        parsed.data.matchId,
        parsed.data.outcome,
        parsed.data.predictedHomeGoals,
        parsed.data.predictedAwayGoals
      ]
    );

    res.json({ prediction: mapPrediction(prediction) });
  })
);

app.get(
  "/api/leaderboard",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `SELECT
         u.id,
         u.username,
         COALESCE(SUM(p.points), 0)::int AS total_points,
         COUNT(p.id)::int AS predictions_count,
         COALESCE(SUM(CASE WHEN p.points = 5 THEN 1 ELSE 0 END), 0)::int AS perfect_tips,
         COALESCE(SUM(CASE WHEN p.points = 5 THEN 2 ELSE 0 END), 0)::int AS bonus_points
       FROM users u
       LEFT JOIN predictions p ON p.user_id = u.id
       WHERE u.role != 'ADMIN'
       GROUP BY u.id
       ORDER BY total_points DESC, predictions_count DESC, lower(u.username) ASC`
    );

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
        perfectTips: row.perfect_tips,
        bonusPoints: row.bonus_points
      };
    });

    res.json({ leaderboard });
  })
);

app.post(
  "/api/admin/matches",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = matchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ugyldig kampdata." });
    const date = parsed.data.date ?? parsed.data.startTime.slice(0, 10);
    const localTime = parsed.data.localTime ?? parsed.data.startTime.slice(11, 16);
    const timezone = parsed.data.timezone ?? getTimezoneForCity(parsed.data.city);
    const kickoff = buildKickoffFields(date, localTime, timezone);

    const match = await one(
      `INSERT INTO matches
        (match_number, home_team, away_team, start_time, match_date, local_time, timezone, kickoff_at_utc, stadium, group_name, city, stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
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
      ]
    );

    res.status(201).json({ match: mapMatch(match) });
  })
);

app.put(
  "/api/admin/matches/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = matchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ugyldig kampdata." });
    const date = parsed.data.date ?? parsed.data.startTime.slice(0, 10);
    const localTime = parsed.data.localTime ?? parsed.data.startTime.slice(11, 16);
    const timezone = parsed.data.timezone ?? getTimezoneForCity(parsed.data.city);
    const kickoff = buildKickoffFields(date, localTime, timezone);

    const match = await one(
      `UPDATE matches
       SET
         match_number = $1,
         home_team = $2,
         away_team = $3,
         start_time = $4,
         match_date = $5,
         local_time = $6,
         timezone = $7,
         kickoff_at_utc = $8,
         stadium = $9,
         group_name = $10,
         city = $11,
         stage = $12,
         updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [
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
      ]
    );

    if (!match) return res.status(404).json({ message: "Kampen finst ikkje." });
    res.json({ match: mapMatch(match) });
  })
);

app.put(
  "/api/admin/matches/:id/result",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = resultSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ugyldig resultat." });

    const match = await one(
      `UPDATE matches
       SET home_score = $1, away_score = $2, status = 'FINISHED', updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [parsed.data.homeScore, parsed.data.awayScore, req.params.id]
    );

    if (!match) return res.status(404).json({ message: "Kampen finst ikkje." });

    await recalculateMatchPoints(req.params.id);
    const updatedMatch = await one("SELECT * FROM matches WHERE id = $1", [req.params.id]);
    res.json({ match: mapMatch(updatedMatch) });
  })
);

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.message?.startsWith("CORS blocked origin")) {
    return res.status(403).json({ message: "Origin er ikkje tillaten av CORS." });
  }
  res.status(500).json({ message: "Noko gjekk gale på serveren." });
});

app.listen(port, () => {
  console.log(`VM-tippe API køyrer på port ${port}`);
});

function mapMatch(match) {
  const predictionDeadline = getPredictionDeadline(match);

  return {
    id: match.id,
    matchNumber: match.match_number,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    startTime: toIso(match.start_time),
    kickoffAtUtc: toIso(match.kickoff_at_utc ?? match.start_time),
    date: formatDate(match.match_date),
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
    createdAt: toIso(prediction.created_at),
    updatedAt: toIso(prediction.updated_at)
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
    createdAt: toIso(prediction.created_at),
    updatedAt: toIso(prediction.updated_at)
  };
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function formatDate(value) {
  if (!value) return value;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
