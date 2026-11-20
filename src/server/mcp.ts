// The MCP endpoint agents connect to (ADR-0005), mounted at /mcp on the room server.
//
// Transport: MCP Streamable HTTP, stateful. Each connected agent gets a session with its own
// McpServer (the SDK's documented pattern). Auth: `Authorization: Bearer <AGENT_TOKEN>`.
//
// What an agent can do (tools): join_room, leave_room, get_messages, send_message.
// How it's woken (ADR-0005 QST-NOTIFY-SHAPE = A): it subscribes to the resource
// `room://<id>`; whenever a message lands in that room, the server sends the standard
// `notifications/resources/updated`, and the agent calls get_messages(after_id).
//
// The notification is driven by the same RoomService "message" event the browsers' WebSocket
// fan-out uses (ADR-0004): MCP is simply a second subscriber.
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "../shared/protocol.ts";
import { RoomError, type RoomService } from "./rooms.ts";

export interface AgentConfig {
  /** Shared secret the agent presents as a bearer token. */
  token: string;
  /** The agent's display name in rooms; also its identity in phase 1 (one agent). */
  name: string;
}

export const ROOM_URI_PREFIX = "room://";

/** Guidance sent to every connecting agent (MCP `instructions`), the platform's channel for
 * telling agents how to behave (see ADR-0001 QST-REPLY-LOOPS). */
const INSTRUCTIONS = `This server is a chat room platform. To take part in a room:
1. Call join_room with the room id from the room's link (…/r/<room_id>). You can be in one room at a time.
2. Subscribe to the resource room://<room_id>. Whenever a message lands there you'll get notifications/resources/updated.
3. On each notification, call get_messages with after_id = the last message id you've seen.
4. Ignore messages whose participant_id is your own; they are your replies coming back.
5. Reply with send_message.`;

interface Session {
  transport: StreamableHTTPServerTransport;
  mcp: McpServer;
  /** roomId → unsubscribe from that room's message events. */
  subscriptions: Map<string, () => void>;
}

export class McpEndpoint {
  readonly #rooms: RoomService;
  readonly #agent: AgentConfig | undefined;
  readonly #sessions = new Map<string, Session>();

  constructor(rooms: RoomService, agent: AgentConfig | undefined) {
    this.#rooms = rooms;
    this.#agent = agent;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const agent = this.#agent;
    if (!agent) {
      return plain(res, 503, "MCP endpoint disabled: set AGENT_TOKEN (and AGENT_NAME) on the server.");
    }
    if (!tokenMatches(req.headers.authorization, agent.token)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return plain(res, 401, "Missing or wrong agent token.");
    }

    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId === "string") {
      const session = this.#sessions.get(sessionId);
      if (!session) return plain(res, 404, "Unknown or expired MCP session; reconnect.");
      return session.transport.handleRequest(req, res);
    }

    // No session yet: this must be an `initialize` POST. The transport rejects anything else;
    // a session is registered only once initialization succeeds.
    const session = this.#createSession(agent);
    await session.mcp.connect(session.transport);
    await session.transport.handleRequest(req, res);
    if (!session.transport.sessionId) await session.mcp.close();
  }

  /** Close every agent session (server shutdown). */
  async closeAll(): Promise<void> {
    await Promise.all([...this.#sessions.values()].map((s) => s.mcp.close()));
  }

  #createSession(agent: AgentConfig): Session {
    const subscriptions = new Map<string, () => void>();
    const mcp = new McpServer(
      { name: "agent-rooms", version: "0.1.0" },
      { capabilities: { resources: { subscribe: true } }, instructions: INSTRUCTIONS },
    );
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        this.#sessions.set(id, session);
      },
    });
    const session: Session = { transport, mcp, subscriptions };
    transport.onclose = () => {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      if (transport.sessionId) this.#sessions.delete(transport.sessionId);
    };
    this.#registerTools(mcp, agent, subscriptions);
    this.#registerRoomResource(mcp, agent, subscriptions);
    return session;
  }

  #registerTools(mcp: McpServer, agent: AgentConfig, subscriptions: Map<string, () => void>) {
    const rooms = this.#rooms;
    const roomId = z.string().min(1).describe("The room id: the last part of the room's link, …/r/<room_id>");

    mcp.registerTool(
      "join_room",
      {
        description:
          "Join a chat room as this agent. Returns your participant_id and the room's recent messages. " +
          "Then subscribe to room://<room_id> to be notified of new messages. One room at a time.",
        inputSchema: { room_id: roomId },
      },
      ({ room_id }) =>
        toolResult(async () => {
          const me = await rooms.joinAsAgent(room_id, agent.name);
          const recent = await rooms.history(room_id, 50);
          return {
            participant_id: me.id,
            room_id,
            subscribe_to: `${ROOM_URI_PREFIX}${room_id}`,
            recent_messages: recent,
          };
        }),
    );

    mcp.registerTool(
      "leave_room",
      {
        description: "Leave a room (e.g. to join a different one).",
        inputSchema: { room_id: roomId },
      },
      ({ room_id }) =>
        toolResult(async () => {
          subscriptions.get(room_id)?.();
          subscriptions.delete(room_id);
          const left = await rooms.leaveAsAgent(room_id, agent.name);
          return { left };
        }),
    );

    mcp.registerTool(
      "get_messages",
      {
        description:
          "Messages in a room you've joined, oldest first. Pass after_id = the last message id you've seen " +
          "to get only newer ones (use this after each room://<room_id> update notification).",
        inputSchema: {
          room_id: roomId,
          after_id: z.string().regex(/^\d+$/).optional().describe("Return only messages with a larger id"),
          limit: z.number().int().min(1).max(200).optional(),
        },
      },
      ({ room_id, after_id, limit }) =>
        toolResult(async () => {
          await this.#requirePresence(room_id, agent);
          return { messages: await rooms.history(room_id, limit ?? 50, after_id) };
        }),
    );

    mcp.registerTool(
      "send_message",
      {
        description: "Post a message in a room you've joined. Friends see it immediately.",
        inputSchema: {
          room_id: roomId,
          text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
        },
      },
      ({ room_id, text }) =>
        toolResult(async () => {
          const me = await this.#requirePresence(room_id, agent);
          const message = await rooms.postMessage(me, text);
          return { message_id: message.id };
        }),
    );
  }

  #registerRoomResource(mcp: McpServer, agent: AgentConfig, subscriptions: Map<string, () => void>) {
    mcp.registerResource(
      "room",
      new ResourceTemplate(`${ROOM_URI_PREFIX}{roomId}`, { list: undefined }),
      {
        description: "A chat room's recent messages. Subscribe to be notified when a new one arrives.",
        mimeType: "application/json",
      },
      async (uri, { roomId }) => {
        const id = String(roomId);
        await this.#requirePresence(id, agent);
        const messages = await this.#rooms.history(id, 50);
        return {
          contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ messages }) }],
        };
      },
    );

    // McpServer doesn't implement subscriptions itself; register the handlers on the
    // underlying Server (the SDK's documented route for advanced features).
    mcp.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      const { uri } = request.params;
      const id = roomIdFromUri(uri);
      await this.#requirePresence(id, agent);
      if (!subscriptions.has(id)) {
        const unsubscribe = this.#rooms.onMessage(id, () => {
          // Fire-and-forget: a dropped notification is recovered by get_messages(after_id).
          mcp.server.sendResourceUpdated({ uri }).catch(() => {});
        });
        subscriptions.set(id, unsubscribe);
      }
      return {};
    });

    mcp.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      const id = roomIdFromUri(request.params.uri);
      subscriptions.get(id)?.();
      subscriptions.delete(id);
      return {};
    });
  }

  /** The agent's participant in this room, or a RoomError if it hasn't joined it. */
  async #requirePresence(roomId: string, agent: AgentConfig) {
    const present = await this.#rooms.agentPresence(agent.name);
    if (!present || present.roomId !== roomId) {
      throw new RoomError(`Not in room ${roomId}. Call join_room first.`);
    }
    return present;
  }
}

function roomIdFromUri(uri: string): string {
  if (!uri.startsWith(ROOM_URI_PREFIX) || uri.length === ROOM_URI_PREFIX.length) {
    throw new RoomError(`Not a room resource: ${uri}`);
  }
  return uri.slice(ROOM_URI_PREFIX.length);
}

/** Run a tool body; return its value as JSON text, or a RoomError as a tool error. */
async function toolResult(body: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await body()) }] };
  } catch (err) {
    if (err instanceof RoomError) return { content: [{ type: "text", text: err.message }], isError: true };
    throw err;
  }
}

function tokenMatches(header: string | undefined, token: string): boolean {
  const presented = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

function plain(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}
