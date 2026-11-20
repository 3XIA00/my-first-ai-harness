// Integration tests for the agent harness (ADR-0006): the real AgentHarness connected over MCP
// to a real room server on the Neon dev branch, with a friend in a real WebSocket.
//
// The model is a stand-in. Its contract is exactly GenerateReply's (system prompt +
// conversation in, text out, may throw), and it answers from what it was given:
// "echo: <the friend's last line>". So these tests check what the *harness* decides (when to
// reply, what the model sees), not what Haiku would say. The live OpenRouter call has its own
// opt-in test (llm.live.test.ts). See the vignette "The Stub That Agreed With the Bug".
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createRoomServer, type RoomServer } from "../server/app.ts";
import { createPool, loadEnv, migrate } from "../server/db.ts";
import type { ChatMessage, CreateRoomResponse, ServerEvent } from "../shared/protocol.ts";
import type { ConversationTurn } from "./conversation.ts";
import { AgentHarness } from "./harness.ts";
import { LlmError, type GenerateReply } from "./llm.ts";

const TOKEN = `test-token-${randomUUID()}`;
const AGENT_NAME = `HarnessAgent-${randomUUID().slice(0, 8)}`;

let pool: pg.Pool;
let app: RoomServer;
let serverUrl: string;
const createdRooms: string[] = [];
const harnesses: AgentHarness[] = [];
const sockets: WebSocket[] = [];

beforeAll(async () => {
  loadEnv();
  if (!process.env.DEV_BRANCH) {
    throw new Error("Tests need DEV_BRANCH (the Neon dev branch) in .env; refusing to use DATABASE_URL.");
  }
  pool = createPool(process.env.DEV_BRANCH);
  await migrate(pool);
  app = createRoomServer(pool, { agent: { token: TOKEN, name: AGENT_NAME } });
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  serverUrl = `http://localhost:${(app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.stop()));
  for (const s of sockets.splice(0)) s.close();
});

afterAll(async () => {
  await app?.close();
  if (createdRooms.length) await pool.query("DELETE FROM rooms WHERE id = ANY($1)", [createdRooms]);
  await pool?.end();
});

async function createRoom(): Promise<string> {
  const res = await fetch(`${serverUrl}/api/rooms`, { method: "POST" });
  const { roomId } = (await res.json()) as CreateRoomResponse;
  createdRooms.push(roomId);
  return roomId;
}

/** The stand-in model: records every call, answers "echo: <last line it was shown>". */
function echoModel(opts: { delayMs?: number; failWith?: () => Error } = {}) {
  const calls: ConversationTurn[][] = [];
  let active = 0;
  let maxConcurrent = 0;
  const generate: GenerateReply = async (_system, conversation) => {
    calls.push(conversation);
    active++;
    maxConcurrent = Math.max(maxConcurrent, active);
    try {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const failure = opts.failWith?.();
      if (failure) throw failure;
      const lastLine = conversation.at(-1)!.content.split("\n").at(-1)!;
      return `echo: ${lastLine}`;
    } finally {
      active--;
    }
  };
  return { generate, calls, maxConcurrent: () => maxConcurrent };
}

async function startHarness(roomId: string, generateReply: GenerateReply) {
  const harness = new AgentHarness({
    serverUrl,
    agentToken: TOKEN,
    roomId,
    systemPrompt: "test persona",
    generateReply,
    log: () => {},
  });
  harnesses.push(harness);
  await harness.start();
  return harness;
}

async function friendIn(roomId: string, name = "Mina") {
  const socket = new WebSocket(`ws://${new URL(serverUrl).host}/ws`);
  sockets.push(socket);
  const messages: ChatMessage[] = [];
  let joined = false;
  socket.on("message", (raw) => {
    const e = JSON.parse(raw.toString()) as ServerEvent;
    if (e.type === "joined") joined = true;
    if (e.type === "message") messages.push(e.message);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "join", roomId, displayName: name }));
  await waitFor(() => joined);
  return {
    say: (body: string) => socket.send(JSON.stringify({ type: "send", body })),
    agentReplies: () => messages.filter((m) => m.kind === "agent").map((m) => m.body),
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const settle = (ms = 1_500) => new Promise((r) => setTimeout(r, ms));

describe("agent harness", () => {
  it("replies to a friend once, and never to its own reply", async () => {
    const roomId = await createRoom();
    const model = echoModel();
    const harness = await startHarness(roomId, model.generate);
    const friend = await friendIn(roomId);

    friend.say("hi there");
    await waitFor(() => friend.agentReplies().length === 1);
    expect(friend.agentReplies()).toEqual(["echo: Mina: hi there"]);

    // The reply came back to the agent as a notification. Given time, a harness that
    // answered its own echo would post again here.
    await settle();
    await harness.idle();
    expect(friend.agentReplies()).toHaveLength(1);
    expect(model.calls).toHaveLength(1);
  });

  it("answers a burst of messages without overlapping replies, having seen all of them", async () => {
    // Three quick lines → three notifications while the (slow) model is still thinking.
    const roomId = await createRoom();
    const model = echoModel({ delayMs: 400 });
    const harness = await startHarness(roomId, model.generate);
    const friend = await friendIn(roomId);

    friend.say("one");
    friend.say("two");
    friend.say("three");
    await waitFor(() => friend.agentReplies().some((r) => r.endsWith("three")));
    await settle();
    await harness.idle();

    expect(model.maxConcurrent()).toBe(1); // never two model calls at once
    expect(friend.agentReplies().length).toBeLessThan(3); // coalesced, not one per message
    const lastSeen = model.calls.at(-1)!.at(-1)!.content;
    expect(lastSeen).toContain("Mina: three");
  });

  it("replies on start to a message written while it was offline", async () => {
    const roomId = await createRoom();
    const friend = await friendIn(roomId);
    friend.say("anyone home?");
    await settle(300);

    const model = echoModel();
    await startHarness(roomId, model.generate);
    await waitFor(() => friend.agentReplies().length === 1);
    expect(friend.agentReplies()).toEqual(["echo: Mina: anyone home?"]);
  });

  it("stays alive when the model fails, and answers the next message", async () => {
    // E.g. the OpenRouter credit runs out (402) or the provider is down for a moment.
    const roomId = await createRoom();
    let failNext = true;
    const model = echoModel({
      failWith: () => {
        if (!failNext) return undefined as never;
        failNext = false;
        return new LlmError("out-of-credit", "OpenRouter 402: insufficient credits", 402);
      },
    });
    const harness = await startHarness(roomId, model.generate);
    const friend = await friendIn(roomId);

    friend.say("first");
    await waitFor(() => model.calls.length === 1);
    await harness.idle();
    expect(friend.agentReplies()).toEqual([]); // failed call → silence, not a crash

    friend.say("second");
    await waitFor(() => friend.agentReplies().length === 1);
    expect(friend.agentReplies()[0]).toBe("echo: Mina: second");
  });

  it("switches rooms when started in a new room after a crash left it in the old one", async () => {
    // "One friend at a time" (ADR-0005): the agent is pointed at a new friend's link. If the
    // previous run crashed without leaving, the server still has it in the old room.
    const [oldRoom, newRoom] = [await createRoom(), await createRoom()];
    await startHarness(oldRoom, echoModel().generate);
    harnesses.length = 0; // simulate a crash: never call stop(), so it never leaves

    const model = echoModel();
    await startHarness(newRoom, model.generate);
    const friend = await friendIn(newRoom);
    friend.say("new friend here");
    await waitFor(() => friend.agentReplies().length === 1);
  });
});
