// Database connection. Reads DATABASE_URL from the environment; `.env` (gitignored) is loaded
// by loadEnv() so secrets never live in code (ADR-0004).
import { readFile } from "node:fs/promises";
import pg from "pg";

/** Load `.env` into process.env if it exists. Uses Node's built-in loader; no dotenv. */
export function loadEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Which database this process uses (ADR-0004 QST-TEST-DB):
 *   - DEV_BRANCH   — the Neon `dev` branch; set only in the local .env, so it wins locally.
 *   - DATABASE_URL — the main branch; set on Render at M4, where DEV_BRANCH doesn't exist.
 */
export function databaseUrl(): string {
  const url = process.env.DEV_BRANCH || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("No database configured: set DEV_BRANCH (local) or DATABASE_URL (deploy) in .env.");
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    // Never print the value: it may be a secret pasted into the wrong variable.
    const which = process.env.DEV_BRANCH ? "DEV_BRANCH" : "DATABASE_URL";
    throw new Error(`${which} must be a Postgres connection string (postgresql://…).`);
  }
  return url;
}

export function createPool(connectionString = databaseUrl()): pg.Pool {
  return new pg.Pool({ connectionString, max: 5 });
}

/** Apply schema.sql. Every statement is IF NOT EXISTS, so this is safe to repeat. */
export async function migrate(pool: pg.Pool): Promise<void> {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}
