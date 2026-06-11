import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(6).max(128)
});

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export const passwordResetSchema = z.object({
  newPassword: z.string().min(4).max(128)
});

export const predictionSchema = z.object({
  matchId: z.number().int().positive(),
  outcome: z.enum(["HOME", "DRAW", "AWAY"]),
  predictedHomeGoals: z.number().int().min(0).max(30),
  predictedAwayGoals: z.number().int().min(0).max(30)
});

export const matchSchema = z.object({
  matchNumber: z.number().int().positive().max(104).optional().nullable(),
  homeTeam: z.string().trim().min(1).max(80),
  awayTeam: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().trim().max(80).optional().nullable(),
  startTime: z.string().optional(),
  stadium: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  groupName: z.string().trim().max(80).optional().nullable(),
  stage: z.string().trim().max(80).optional().nullable()
}).refine((data) => Boolean((data.date && data.localTime) || data.startTime), {
  message: "Kamp må ha dato og lokal tid."
});

export const resultSchema = z.object({
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30)
});

const optionalName = z.string().trim().max(100).optional().nullable();

export const extraPredictionSchema = z.object({
  predictedWinnerTeam: optionalName,
  predictedTopScorerName: optionalName,
  predictedTopScorerTeam: optionalName,
  goalkeeper: optionalName,
  leftBack: optionalName,
  centerBack1: optionalName,
  centerBack2: optionalName,
  rightBack: optionalName,
  midfielder1: optionalName,
  midfielder2: optionalName,
  midfielder3: optionalName,
  leftWing: optionalName,
  striker: optionalName,
  rightWing: optionalName
});

export const extraResultSchema = extraPredictionSchema.extend({
  winnerTeam: optionalName,
  topScorerName: optionalName,
  topScorerTeam: optionalName
}).omit({
  predictedWinnerTeam: true,
  predictedTopScorerName: true,
  predictedTopScorerTeam: true
});

