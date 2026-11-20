// `npm run dev:server` — start the room server on SERVER_PORT (default 3001).
//
// Environment (.env locally, Render's settings at M4):
//   DEV_BRANCH / DATABASE_URL  which database (see db.ts)
//   AGENT_TOKEN                secret the agent presents to /mcp; unset = MCP disabled
//   AGENT_NAME                 the agent's display name in rooms (default "Agent")
import { createRoomServer } from "./app.ts";
import { createPool, loadEnv, migrate } from "./db.ts";

loadEnv();
const port = Number(process.env.SERVER_PORT ?? 3001);
const pool = createPool();
await migrate(pool);

const token = process.env.AGENT_TOKEN;
const agent = token ? { token, name: process.env.AGENT_NAME || "Agent" } : undefined;

const { server } = createRoomServer(pool, { agent });
server.listen(port, () => {
  console.log(`room server listening on http://localhost:${port} (WebSocket at /ws)`);
  console.log(
    agent
      ? `MCP endpoint at http://localhost:${port}/mcp for agent "${agent.name}"`
      : "MCP endpoint disabled (set AGENT_TOKEN in .env to enable it)",
  );
});
