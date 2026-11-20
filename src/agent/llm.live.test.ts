// LIVE test: one real call to Claude Haiku 5.5 through OpenRouter (ADR-0006).
// Costs about $0.0003 per run, so it's opt-in and NOT part of `just gate`:
//   npm run test:live
// It checks the things only the real service can tell us: the key works, the model id and
// `reasoning_effort` are accepted, and the response shape matches what llm.ts reads.
import { describe, expect, it } from "vitest";
import { loadEnv } from "../server/db.ts";
import { LlmError, openRouterReplier } from "./llm.ts";

loadEnv();

describe("OpenRouter (live)", () => {
  it("gets a short reply from Claude Haiku 5.5 at low effort", async () => {
    const apiKey = process.env.OPENROUTER_KEY;
    if (!apiKey) throw new Error("OPENROUTER_KEY is not set in .env");
    const reply = await openRouterReplier({ apiKey, maxTokens: 300 })(
      "You are a friendly chat companion. Reply in one short sentence.",
      [{ role: "user", content: "Mina: hi! say hello back in five words or fewer." }],
    );
    console.log(`live reply: ${reply}`);
    expect(reply.length).toBeGreaterThan(0);
  });

  it("reports a wrong key as 'bad-key', not as a crash or an empty reply", async () => {
    const call = openRouterReplier({ apiKey: "sk-or-not-a-real-key" })("x", [{ role: "user", content: "hi" }]);
    await expect(call).rejects.toMatchObject({ kind: "bad-key" } satisfies Partial<LlmError>);
  });
});
