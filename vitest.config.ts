// Tests run against the real database in DEV_BRANCH (ADR-0004 QST-TEST-DB), so they get a
// generous timeout for network round-trips to Neon.
//
// *.live.test.ts files call paid services (OpenRouter) and run only with LIVE=1
// (`npm run test:live`), never as part of `npm run check` / `just gate` (ADR-0006).
import { defineConfig } from "vitest/config";

const live = process.env.LIVE === "1";

export default defineConfig({
  test: {
    include: live ? ["src/**/*.live.test.ts"] : ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: live ? [] : ["src/**/*.live.test.ts", "**/node_modules/**"],
    testTimeout: live ? 90_000 : 20_000,
    hookTimeout: 30_000,
  },
});
