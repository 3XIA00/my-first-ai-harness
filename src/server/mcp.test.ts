// Integration tests for the MCP endpoint (ADR-0005): the SDK's own MCP client plays the agent,
// a `ws` client plays a friend's browser, against a real room server on the Neon dev branch.
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ChatMessage, CreateRoomResponse, ServerEvent } from "../shared/protocol.ts";
import { createRoomServer, type RoomServer } from "./app.ts";
import { createPool, loadEnv, migrate } from "./db.ts";

const TOKEN = `test-token-${randomUUID()}`;
// The agent's identity is its name (phase 1), and its room membership persists in the
// database, so every test run uses a fresh name to start from a clean slate.
const AGENT_NAME = `TestAgent-${randomUUID().slice(0, 8)}`;

let pool: pg.Pool;
let app: RoomServer;
let port: number;
const createdRooms: string[] = [];
const openAgents: Client[] = [];

beforeAll(async () => {
  loadEnv();
  if (!process.env.DEV_BRANCH) {
    throw new Error("Tests need DEV_BRANCH (the Neon dev branch) in .env; refusing to use DATABASE_URL.");
  }
  pool = createPool(process.env.DEV_BRANCH);
  await migrate(pool);
  app = createRoomServer(pool, { agent: { token: TOKEN, name: AGENT_NAME } });
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  port = (app.server.address() as AddressInfo).port;
});

afterEach(async () => {
  // Leave whatever room the agent is in, so each test starts with the agent in no room.
  await pool.query(
    "UPDATE participants SET left_at = now() WHERE kind = 'agent' AND display_name = $1 AND left_at IS NULL",
    [AGENT_NAME],
  );
  await Promise.all(openAgents.splice(0).map((c) => c.close()));
});

afterAll(async () => {
  await app?.close();
  if (createdRooms.length) await pool.query("DELETE FROM rooms WHERE id = ANY($1)", [createdRooms]);
  await pool?.end();
});

async function createRoom(): Promise<string> {
  const res = await fetch(`http://localhost:${port}/api/rooms`, { method: "POST" });
  const { roomId } = (await res.json()) as CreateRoomResponse;
  createdRooms.push(roomId);
  return roomId;
}

/** An agent connected over MCP, recording every room://… update notification it receives. */
async function connectAgent(token = TOKEN) {
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const updates: string[] = [];
  const waiters: Array<() => void> = [];
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => {
    updates.push(n.params.uri);
    for (const wake of waiters.splice(0)) wake();
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  openAgents.push(client);

  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    if (result.isError) throw new Error(text);
    return JSON.parse(text) as Record<string, unknown>;
  }

  async function nextUpdate(timeoutMs = 10_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (updates.length === 0) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error("timed out waiting for a resources/updated notification");
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, left);
      });
    }
    return updates.shift()!;
  }

  return { client, call, nextUpdate, updates };
}

/** A friend's browser tab: joins over WebSocket and collects the events it receives. */
async function connectFriend(roomId: string, name: string) {
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const events: ServerEvent[] = [];
  socket.on("message", (raw) => events.push(JSON.parse(raw.toString()) as ServerEvent));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "join", roomId, displayName: name }));
  await waitFor(() => events.some((e) => e.type === "joined"));
  return {
    say: (body: string) => socket.send(JSON.stringify({ type: "send", body })),
    messages: () => events.flatMap((e) => (e.type === "message" ? [e.message] : [])),
    close: () => socket.close(),
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("MCP endpoint", () => {
  it("rejects callers without the right agent token", async () => {
    // The endpoint is public from M4 on; without the token anyone could speak as the agent.
    const missing = await fetch(`http://localhost:${port}/mcp`, { method: "POST" });
    expect(missing.status).toBe(401);
    await expect(connectAgent("wrong-token")).rejects.toThrow();
  });

  it("wakes the agent when a friend writes, and delivers the agent's reply to the friend", async () => {
    // The whole phase-1 loop, minus the model: friend writes → notification → agent reads
    // what's new → agent replies → friend's browser shows it.
    const roomId = await createRoom();
    const agent = await connectAgent();
    const joined = await agent.call("join_room", { room_id: roomId });
    const myId = joined.participant_id as string;
    await agent.client.subscribeResource({ uri: `room://${roomId}` });

    const friend = await connectFriend(roomId, "Mina");
    friend.say("hi agent!");

    expect(await agent.nextUpdate()).toBe(`room://${roomId}`);
    const { messages } = (await agent.call("get_messages", { room_id: roomId })) as {
      messages: ChatMessage[];
    };
    const incoming = messages.at(-1)!;
    expect(incoming).toMatchObject({ body: "hi agent!", displayName: "Mina", kind: "human" });

    await agent.call("send_message", { room_id: roomId, text: "hello Mina!" });
    await waitFor(() => friend.messages().some((m) => m.body === "hello Mina!"));
    expect(friend.messages().find((m) => m.body === "hello Mina!")).toMatchObject({
      kind: "agent",
      displayName: AGENT_NAME,
      participantId: myId,
    });

    // The agent's own reply also triggers a notification. That's expected; the agent must
    // recognise it as its own (participant id) and not answer itself (ADR-0005 Explicitation 3).
    expect(await agent.nextUpdate()).toBe(`room://${roomId}`);
    const after = (await agent.call("get_messages", { room_id: roomId, after_id: incoming.id })) as {
      messages: ChatMessage[];
    };
    expect(after.messages.map((m) => [m.body, m.participantId])).toEqual([["hello Mina!", myId]]);
    friend.close();
  });

  it("keeps one agent in one room: a second room is refused until it leaves the first", async () => {
    const [first, second] = [await createRoom(), await createRoom()];
    const agent = await connectAgent();
    await agent.call("join_room", { room_id: first });

    await expect(agent.call("join_room", { room_id: second })).rejects.toThrow(/leave_room/);

    await agent.call("leave_room", { room_id: first });
    await agent.call("join_room", { room_id: second });
    // ...and it can no longer post into the room it left.
    await expect(agent.call("send_message", { room_id: first, text: "still here?" })).rejects.toThrow(
      /Not in room/,
    );
  });

  it("doesn't duplicate the agent when it reconnects and joins its room again", async () => {
    // The agent runs on 3XIA00's PC; restarts and network drops will happen.
    const roomId = await createRoom();
    const first = await connectAgent();
    const a = await first.call("join_room", { room_id: roomId });
    await first.client.close();

    const second = await connectAgent();
    const b = await second.call("join_room", { room_id: roomId });
    expect(b.participant_id).toBe(a.participant_id);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM participants WHERE room_id = $1 AND kind = 'agent'",
      [roomId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("won't let the agent read or subscribe to a room it hasn't joined", async () => {
    // Phase 1 rooms are a friend's private chat; the agent sees only the room it's in.
    const [mine, theirs] = [await createRoom(), await createRoom()];
    const agent = await connectAgent();
    await agent.call("join_room", { room_id: mine });

    await expect(agent.call("get_messages", { room_id: theirs })).rejects.toThrow(/Not in room/);
    await expect(agent.client.subscribeResource({ uri: `room://${theirs}` })).rejects.toThrow(/Not in room/);
  });
});
