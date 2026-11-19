// `npm run dev:server` — start the room server on SERVER_PORT (default 3001).
import { createRoomServer } from "./app.ts";
import { createPool, loadEnv, migrate } from "./db.ts";

loadEnv();
const port = Number(process.env.SERVER_PORT ?? 3001);
const pool = createPool();
await migrate(pool);

const { server } = createRoomServer(pool);
server.listen(port, () => {
  console.log(`room server listening on http://localhost:${port} (WebSocket at /ws)`);
});
