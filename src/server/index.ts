// Start the room server.
//   development: `npm run dev:server` (tsx watch, reloads on save)
//   production:  `npm start` = `node src/server/index.ts` (Node's built-in TypeScript support,
//                ADR-0007; resolves TECHNICAL-DEBT TD-2)
//
// Environment (.env locally, Render's settings in production):
//   DEV_BRANCH / DATABASE_URL  which database (see db.ts)
//   PORT                       set by Render; else SERVER_PORT; else 3001
//   AGENT_TOKEN                secret the agent presents to /mcp; unset = MCP disabled
//   AGENT_NAME                 the agent's display name in rooms (default "Agent")
//   ALLOWED_ORIGINS            comma-separated web origins allowed to use this server,
//                              e.g. https://3xia00.github.io (default http://localhost:5173)
import { createRoomServer, DEFAULT_ALLOWED_ORIGINS } from "./app.ts";
import { createPool, loadEnv, migrate } from "./db.ts";

loadEnv();
const port = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3001);
const pool = createPool();
await migrate(pool);

const token = process.env.AGENT_TOKEN;
const agent = token ? { token, name: process.env.AGENT_NAME || "Agent" } : undefined;
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

const { server } = createRoomServer(pool, { agent, allowedOrigins });
server.listen(port, () => {
  console.log(`room server listening on port ${port} (WebSocket at /ws)`);
  console.log(`pages allowed from: ${allowedOrigins.join(", ")}`);
  console.log(
    agent
      ? `MCP endpoint at /mcp for agent "${agent.name}"`
      : "MCP endpoint disabled (set AGENT_TOKEN to enable it)",
  );
});
