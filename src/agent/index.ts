// `npm run agent -- <room link or id>`: run 3XIA00's agent in one room (ADR-0006).
//
// Environment (.env):
//   AGENT_TOKEN      the same secret the room server checks on /mcp
//   OPENROUTER_KEY   the professor's OpenRouter key (ADR-0003 QST-MODEL-ACCESS)
//   AGENT_NAME       the agent's name, filled into persona.md (match the server's AGENT_NAME)
//   ROOM_SERVER_URL  optional, default http://localhost:3001
//   AGENT_MODEL      optional, default anthropic/claude-haiku-5.5
//   AGENT_HISTORY    optional, messages the model sees per reply, default 50
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../server/db.ts";
import { AgentHarness } from "./harness.ts";
import { openRouterReplier } from "./llm.ts";

loadEnv();

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npm run agent -- <room link or room id>");
  process.exit(1);
}
const roomId = roomIdFrom(arg);
const agentToken = required("AGENT_TOKEN");
const apiKey = required("OPENROUTER_KEY");
const name = process.env.AGENT_NAME || "Agent";

const persona = await readFile(fileURLToPath(new URL("./persona.md", import.meta.url)), "utf8");
const harness = new AgentHarness({
  serverUrl: process.env.ROOM_SERVER_URL || "http://localhost:3001",
  agentToken,
  roomId,
  systemPrompt: persona.replaceAll("{{name}}", name),
  generateReply: openRouterReplier({ apiKey, model: process.env.AGENT_MODEL || undefined }),
  historySize: Number(process.env.AGENT_HISTORY) || 50,
});

process.on("SIGINT", async () => {
  console.log("\nstopping…");
  await harness.stop();
  process.exit(0);
});

await harness.start();
console.log(`${name} is listening. Ctrl+C to stop (it leaves the room).`);

/** Accept a full room link (…/r/<id> or …/#/r/<id>) or a bare room id. */
function roomIdFrom(input: string): string {
  const match = /\/r\/([A-Za-z0-9_-]+)/.exec(input);
  return match?.[1] ?? input.trim();
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`${key} is not set in .env`);
    process.exit(1);
  }
  return value;
}
