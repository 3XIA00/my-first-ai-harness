// `npm run db:migrate` — apply src/server/schema.sql to the database in DATABASE_URL.
import { createPool, loadEnv, migrate } from "./db.ts";

loadEnv();
const pool = createPool();
try {
  await migrate(pool);
  console.log("✅ schema applied");
} finally {
  await pool.end();
}
