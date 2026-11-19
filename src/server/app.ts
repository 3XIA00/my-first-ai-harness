// The room server: plain node:http for the two HTTP routes, `ws` for live chat (ADR-0004).
//
// HTTP
//   POST /api/rooms   → { roomId }      create a room; its id is the shareable link
//   GET  /api/health  → { ok: true }
// WebSocket at /ws — see src/shared/protocol.ts for the messages.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type pg from "pg";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  ChatMessage,
  ClientEvent,
  CreateRoomResponse,
  Participant,
  ServerEvent,
} from "../shared/protocol.ts";
import { RoomError, RoomService } from "./rooms.ts";

export interface RoomServer {
  server: Server;
  rooms: RoomService;
  close(): Promise<void>;
}

export function createRoomServer(pool: pg.Pool): RoomServer {
  const rooms = new RoomService(pool);
  const server = createServer((req, res) => {
    handleHttp(rooms, req, res).catch((err) => {
      console.error("HTTP handler failed:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal error" });
    });
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket) => handleSocket(rooms, socket));

  return {
    server,
    rooms,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function handleHttp(rooms: RoomService, req: IncomingMessage, res: ServerResponse) {
  if (req.method === "POST" && req.url === "/api/rooms") {
    const body: CreateRoomResponse = { roomId: await rooms.createRoom() };
    return sendJson(res, 201, body);
  }
  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 404, { error: "Not found" });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** One browser tab = one socket = (after `join`) one participant in one room. */
function handleSocket(rooms: RoomService, socket: WebSocket) {
  let participant: Participant | null = null;
  let unsubscribe: (() => void) | null = null;
  // Handle this socket's events strictly in order, so a `send` that arrives right behind
  // its `join` waits for the join to finish instead of being rejected as "not joined".
  let queue: Promise<void> = Promise.resolve();

  const send = (event: ServerEvent) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  };

  socket.on("message", (raw) => {
    queue = queue.then(async () => {
      try {
        await handleEvent(parseClientEvent(raw.toString()));
      } catch (err) {
        if (err instanceof RoomError) return send({ type: "error", error: err.message });
        console.error("WebSocket handler failed:", err);
        send({ type: "error", error: "Something went wrong on the server." });
      }
    });
  });

  socket.on("close", () => unsubscribe?.());

  async function handleEvent(event: ClientEvent) {
    switch (event.type) {
      case "join": {
        if (participant) throw new RoomError("You have already joined a room.");
        const joined = await rooms.addParticipant(event.roomId, "human", event.displayName);
        // Subscribe *before* reading history, buffering live messages until history is
        // sent — otherwise a message posted between the two steps would be lost.
        const buffered: ChatMessage[] = [];
        let live = false;
        unsubscribe = rooms.onMessage(joined.roomId, (message) => {
          if (live) send({ type: "message", message });
          else buffered.push(message);
        });
        const history = await rooms.history(joined.roomId);
        participant = joined;
        send({ type: "joined", participant: joined, history });
        const seen = new Set(history.map((m) => m.id));
        for (const message of buffered) {
          if (!seen.has(message.id)) send({ type: "message", message });
        }
        live = true;
        return;
      }
      case "send": {
        if (!participant) throw new RoomError("Join a room before sending messages.");
        await rooms.postMessage(participant, event.body);
        return;
      }
    }
  }
}

/** Validate untrusted JSON from the browser into a ClientEvent. */
function parseClientEvent(text: string): ClientEvent {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RoomError("Malformed message.");
  }
  const e = data as Record<string, unknown> | null;
  if (e?.type === "join" && typeof e.roomId === "string" && typeof e.displayName === "string") {
    return { type: "join", roomId: e.roomId, displayName: e.displayName };
  }
  if (e?.type === "send" && typeof e.body === "string") {
    return { type: "send", body: e.body };
  }
  throw new RoomError("Unknown or malformed message.");
}
