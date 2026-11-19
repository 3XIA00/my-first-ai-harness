// Vite serves the React chat page (src/client) in development and builds it for M4.
// During development the room server runs separately on SERVER_PORT; Vite forwards
// /api (HTTP) and /ws (WebSocket) to it, so the browser only ever talks to one origin.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3001);

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": `http://localhost:${SERVER_PORT}`,
      "/ws": { target: `ws://localhost:${SERVER_PORT}`, ws: true },
    },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
