import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const isPostgres = !!process.env.DATABASE_URL;

async function clearDatabase() {
  console.log("Starting database cleaning procedure...");

  // 1. Clear Postgres database if configured
  if (isPostgres) {
    console.log("- Connecting to PostgreSQL (Neon)...");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });

    const client = await pool.connect();
    try {
      console.log("- Truncating all PostgreSQL tables...");
      await client.query(`
        TRUNCATE TABLE 
          users, 
          incomes, 
          expenses, 
          saving_goals, 
          goal_contributions, 
          chat_history, 
          budgets 
        RESTART IDENTITY CASCADE;
      `);
      console.log("- All PostgreSQL tables truncated successfully.");
    } catch (err) {
      console.error("Error truncating PostgreSQL tables:", err);
    } finally {
      client.release();
      await pool.end();
    }
  } else {
    console.log("- PostgreSQL is not configured. Skipping remote database clear.");
  }

  console.log("Database cleaning complete. Slate is 100% clean!");
}

clearDatabase().catch(err => {
  console.error("Clean script failed:", err);
});
