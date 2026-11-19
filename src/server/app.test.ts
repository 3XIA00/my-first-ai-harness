// Integration tests for the room server: a real HTTP + WebSocket server on a random port,
// real `ws` clients, and the real Postgres in DEV_BRANCH — the Neon `dev` branch
// (ADR-0004 QST-TEST-DB = B). Every room a test creates is deleted afterwards.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type pg from "pg";
import type { ClientEvent, CreateRoomResponse, ServerEvent } from "../shared/protocol.ts";
import { createRoomServer, type RoomServer } from "./app.ts";
import { createPool, loadEnv, migrate } from "./db.ts";

let pool: pg.Pool;
let app: RoomServer;
let baseUrl: string;
const createdRooms: string[] = [];

beforeAll(async () => {
  loadEnv();
  // Tests write rows, so they must never fall back to DATABASE_URL (the main branch, where
  // friends' real chats will live from M4 on).
  if (!process.env.DEV_BRANCH) {
    throw new Error("Tests need DEV_BRANCH (the Neon dev branch) in .env; refusing to use DATABASE_URL.");
  }
  pool = createPool(process.env.DEV_BRANCH);
  await migrate(pool);
  app = createRoomServer(pool);
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  baseUrl = `localhost:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app?.close();
  if (createdRooms.length) {
    await pool.query("DELETE FROM rooms WHERE id = ANY($1)", [createdRooms]);
  }
  await pool?.end();
});

async function createRoom(): Promise<string> {
  const res = await fetch(`http://${baseUrl}/api/rooms`, { method: "POST" });
  expect(res.status).toBe(201);
  const { roomId } = (await res.json()) as CreateRoomResponse;
  createdRooms.push(roomId);
  return roomId;
}

/** A browser-tab stand-in: sends ClientEvents, lets the test await specific ServerEvents. */
class TestClient {
  readonly #socket: WebSocket;
  readonly #received: ServerEvent[] = [];
  readonly #waiters: Array<() => void> = [];

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.on("message", (raw) => {
      this.#received.push(JSON.parse(raw.toString()) as ServerEvent);
      for (const wake of this.#waiters.splice(0)) wake();
    });
  }

  static async connect(): Promise<TestClient> {
    const socket = new WebSocket(`ws://${baseUrl}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    return new TestClient(socket);
  }

  send(event: ClientEvent) {
    this.#socket.send(JSON.stringify(event));
  }

  /** Wait for (and consume) the next received event of the given type. */
  async next<T extends ServerEvent["type"]>(
    type: T,
    timeoutMs = 10_000,
  ): Promise<Extract<ServerEvent, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.#received.findIndex((e) => e.type === type);
      if (i >= 0) return this.#received.splice(i, 1)[0] as Extract<ServerEvent, { type: T }>;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for "${type}"`);
      await new Promise<void>((resolve) => {
        this.#waiters.push(resolve);
        setTimeout(resolve, left);
      });
    }
  }

  /** Everything received so far that hasn't been consumed by next(). */
  pending(): ServerEvent[] {
    return [...this.#received];
  }

  close() {
    this.#socket.close();
  }
}

async function join(roomId: string, displayName: string) {
  const client = await TestClient.connect();
  client.send({ type: "join", roomId, displayName });
  const joined = await client.next("joined");
  return { client, joined };
}

describe("room server", () => {
  it("delivers a message to everyone in the room, stores it, and shows it to later joiners", async () => {
    const roomId = await createRoom();
    const alice = await join(roomId, "Alice");
    const bob = await join(roomId, "Bob");

    alice.client.send({ type: "send", body: "hi Bob!" });

    const atBob = await bob.client.next("message");
    expect(atBob.message).toMatchObject({
      body: "hi Bob!",
      displayName: "Alice",
      kind: "human",
      participantId: alice.joined.participant.id,
    });
    // The sender sees their own message come back too — that's how their UI shows it.
    expect((await alice.client.next("message")).message.id).toBe(atBob.message.id);

    // Someone opening the link later sees the conversation so far.
    const carol = await join(roomId, "Carol");
    expect(carol.joined.history.map((m) => m.body)).toEqual(["hi Bob!"]);

    for (const c of [alice, bob, carol]) c.client.close();
  });

  it("keeps rooms private: a message in one room never reaches another room", async () => {
    // Phase 1 gives each friend their own 1:1 room with the agent (ADR-0003); a leak
    // between rooms would show one friend another friend's private conversation.
    const [roomA, roomB] = [await createRoom(), await createRoom()];
    const alice = await join(roomA, "Alice");
    const bob = await join(roomB, "Bob");

    alice.client.send({ type: "send", body: "for room A only" });
    await alice.client.next("message"); // delivered and stored in room A

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(bob.client.pending()).toEqual([]);
    const late = await join(roomB, "Late");
    expect(late.joined.history).toEqual([]);

    for (const c of [alice, bob, late]) c.client.close();
  });

  it("accepts a message sent right behind `join`, without waiting for `joined`", async () => {
    // M3's agent client may pipeline join + send. Events from one socket are handled in
    // order, so the send must wait for the join instead of failing as "not joined".
    const roomId = await createRoom();
    const client = await TestClient.connect();
    client.send({ type: "join", roomId, displayName: "Eager" });
    client.send({ type: "send", body: "first words" });

    await client.next("joined");
    expect((await client.next("message")).message.body).toBe("first words");
    expect(client.pending().filter((e) => e.type === "error")).toEqual([]);
    client.close();
  });

  it("tells a visitor with a wrong or stale link that the room doesn't exist", async () => {
    const client = await TestClient.connect();
    client.send({ type: "join", roomId: "no-such-room", displayName: "Lost" });
    expect((await client.next("error")).error).toBe("This room doesn't exist.");
    client.close();
  });
});
