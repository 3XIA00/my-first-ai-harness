// Tests run against the real database in DATABASE_URL (ADR-0004 QST-TEST-DB), so they get a
// generous timeout for network round-trips to Neon.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
