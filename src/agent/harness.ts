// The agent harness (ADR-0006): the program that gives the model a body in a chat room.
//
// The model never sees MCP. This class does all the MCP work: join the room, listen for the
// room's update notifications, read what's new, decide whether a reply is due, call the
// model with the conversation, and post its answer. The model only turns a conversation
// into text (GenerateReply).
//
// Three timing problems it handles (ADR-0006 Explicitation 3):
//   bursts       → turns never overlap; notifications during a turn cause exactly one more
//   its own echo → messages written by me never trigger a reply
//   missed msgs  → on start / reconnect, catch up from the last message id seen
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ChatMessage } from "../shared/protocol.ts";
import { buildConversation } from "./conversation.ts";
import { LlmError, type GenerateReply } from "./llm.ts";

export interface HarnessOptions {
  /** Room server base URL, e.g. http://localhost:3001 */
  serverUrl: string;
  agentToken: string;
  roomId: string;
  systemPrompt: string;
  generateReply: GenerateReply;
  /** How many recent messages the model sees (ADR-0006 QST-HISTORY-WINDOW). */
  historySize?: number;
  log?: (line: string) => void;
}

export class AgentHarness {
  readonly #opts: Required<Omit<HarnessOptions, "log">> & { log: (line: string) => void };
  #client: Client | null = null;
  #me = ""; // my participant id
  #lastSeenId: string | undefined; // newest message id processed
  #turnRunning = false;
  #turnRequested = false;
  #stopped = false;
  #reconnectDelayMs = 1_000;
  #idle: Promise<void> = Promise.resolve();

  constructor(opts: HarnessOptions) {
    this.#opts = { historySize: 50, log: (line) => console.log(line), ...opts };
  }

  /** Connect, join, catch up, and start listening. Resolves once listening. */
  async start(): Promise<void> {
    this.#stopped = false;
    await this.#connect();
  }

  /** Leave the room and disconnect (Ctrl+C). */
  async stop(): Promise<void> {
    this.#stopped = true;
    const client = this.#client;
    this.#client = null;
    if (!client) return;
    await this.#idle;
    try {
      await this.#call(client, "leave_room", { room_id: this.#opts.roomId });
      this.#opts.log(`left room ${this.#opts.roomId}`);
    } catch {
      // Leaving is best-effort; the server may already be gone.
    }
    await client.close();
  }

  /** Resolves when no turn is running or queued. For tests and clean shutdown. */
  async idle(): Promise<void> {
    await this.#idle;
  }

  // ---- connection ----------------------------------------------------------------------

  async #connect(): Promise<void> {
    const { serverUrl, agentToken, roomId } = this.#opts;
    const client = new Client({ name: "agent-rooms-harness", version: "0.1.0" });
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => {
      if (n.params.uri === `room://${roomId}`) this.#requestTurn();
    });
    client.onclose = () => {
      if (this.#client === client && !this.#stopped) this.#scheduleReconnect();
    };
    await client.connect(
      new StreamableHTTPClientTransport(new URL("/mcp", serverUrl), {
        requestInit: { headers: { Authorization: `Bearer ${agentToken}` } },
      }),
    );
    this.#client = client;

    const joined = await this.#join(client);
    this.#me = joined.participant_id;
    await client.subscribeResource({ uri: `room://${roomId}` });
    this.#reconnectDelayMs = 1_000;

    if (this.#lastSeenId === undefined) {
      // First start: everything already in the room is "seen", except that if the newest
      // message is a human's (they wrote while I was offline), it still deserves a reply.
      const recent = joined.recent_messages;
      const newest = recent.at(-1);
      this.#lastSeenId = newest?.id;
      this.#opts.log(`joined room ${roomId} as participant ${this.#me}`);
      if (newest && newest.participantId !== this.#me) this.#requestTurn({ replyDue: true });
    } else {
      // Reconnect: catch up on anything that arrived while disconnected.
      this.#opts.log(`reconnected to room ${roomId}`);
      this.#requestTurn();
    }
  }

  /** join_room, switching rooms if the agent is still in another one (phase 1: one room). */
  async #join(client: Client): Promise<{ participant_id: string; recent_messages: ChatMessage[] }> {
    const { roomId } = this.#opts;
    try {
      return (await this.#call(client, "join_room", { room_id: roomId })) as never;
    } catch (err) {
      // The server's refusal names the room I'm still in (src/server/rooms.ts joinAsAgent).
      // Both ends are ours, so reading it from the message is safe; "one friend at a time"
      // (ADR-0005 QST-ROOM-SHARING) means switching rooms is the normal case.
      const other = /Already in room (\S+?)\./.exec((err as Error).message)?.[1];
      if (!other) throw err;
      this.#opts.log(`leaving room ${other} to join ${roomId}`);
      await this.#call(client, "leave_room", { room_id: other });
      return (await this.#call(client, "join_room", { room_id: roomId })) as never;
    }
  }

  #scheduleReconnect() {
    const delay = this.#reconnectDelayMs;
    this.#reconnectDelayMs = Math.min(delay * 2, 30_000);
    this.#opts.log(`connection lost; reconnecting in ${delay / 1000}s`);
    setTimeout(() => {
      if (this.#stopped) return;
      this.#connect().catch((err) => {
        this.#opts.log(`reconnect failed: ${(err as Error).message}`);
        this.#scheduleReconnect();
      });
    }, delay);
  }

  // ---- turns ---------------------------------------------------------------------------

  /** Ask for a turn. If one is running, exactly one more runs after it (bursts coalesce). */
  #requestTurn(opts: { replyDue?: boolean } = {}) {
    if (opts.replyDue) this.#replyDue = true;
    if (this.#turnRunning) {
      this.#turnRequested = true;
      return;
    }
    this.#turnRunning = true;
    this.#idle = (async () => {
      do {
        this.#turnRequested = false;
        await this.#turn().catch((err) => this.#opts.log(`turn failed: ${(err as Error).message}`));
      } while (this.#turnRequested && !this.#stopped);
      this.#turnRunning = false;
    })();
  }

  #replyDue = false;

  async #turn(): Promise<void> {
    const client = this.#client;
    if (!client || this.#stopped) return;
    const { roomId, historySize } = this.#opts;

    // 1. What's new since the last message I processed?
    const fresh = (await this.#call(client, "get_messages", {
      room_id: roomId,
      ...(this.#lastSeenId ? { after_id: this.#lastSeenId } : {}),
      limit: 200,
    })) as { messages: ChatMessage[] };
    const newest = fresh.messages.at(-1);
    if (newest) this.#lastSeenId = newest.id;

    // 2. Reply only if a human said something. My own echo never earns a reply.
    const humanSpoke = fresh.messages.some((m) => m.participantId !== this.#me);
    if (!humanSpoke && !this.#replyDue) return;
    this.#replyDue = false;

    // 3. Build what the model sees, and ask it.
    const history = (await this.#call(client, "get_messages", {
      room_id: roomId,
      limit: historySize,
    })) as { messages: ChatMessage[] };
    const conversation = buildConversation(history.messages, this.#me, historySize);
    if (conversation.length === 0) return;

    let reply: string;
    try {
      reply = await this.#opts.generateReply(this.#opts.systemPrompt, conversation);
    } catch (err) {
      // A failed model call leaves the message unanswered; the next human message retries.
      const why = err instanceof LlmError ? `${err.kind}: ${err.message}` : (err as Error).message;
      this.#opts.log(`model call failed (${why}); not replying`);
      return;
    }

    // 4. Post it.
    await this.#call(client, "send_message", { room_id: roomId, text: reply });
    this.#opts.log(`replied (${reply.length} chars)`);
  }

  async #call(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    if (result.isError) throw new Error(text);
    return JSON.parse(text);
  }
}
