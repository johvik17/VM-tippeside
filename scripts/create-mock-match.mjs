#!/usr/bin/env node
import "dotenv/config";
import { pool } from "../server/src/db.js";

// Create a mock match that locks at 19:50 (kickoff at 20:00 Norwegian time)
// This is 18:00 UTC in June (summer time UTC+2)

async function createMockMatch() {
  try {
    // Match kicks off at 20:00 local time today
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    
    const match = await pool.query(
      `INSERT INTO matches
        (home_team, away_team, start_time, match_date, local_time, timezone, kickoff_at_utc, stadium, group_name, city, stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, home_team, away_team, kickoff_at_utc, match_date, local_time`,
      [
        "Test Home",
        "Test Away",
        `${today}T20:00:00`,
        today,
        "20:00",
        "Europe/Oslo",
        `${today}T18:00:00Z`, // 18:00 UTC = 20:00 Norwegian time
        "Test Stadium",
        "Test Group",
        "Test City",
        "Group Stage"
      ]
    );

    const created = match.rows[0];
    console.log("✅ Mock match created!");
    console.log(`ID: ${created.id}`);
    console.log(`Match: ${created.home_team} vs ${created.away_team}`);
    console.log(`Date: ${created.match_date}`);
    console.log(`Local Time: ${created.local_time}`);
    console.log(`Kickoff UTC: ${created.kickoff_at_utc}`);
    console.log("\nThe match will be locked at 19:50 (10 minutes before kickoff)");
    console.log("You can now log in and see this match in the 'Kamper' tab!");
  } catch (error) {
    console.error("❌ Error creating mock match:", error.message);
  } finally {
    await pool.end();
  }
}

createMockMatch();
