// RoomService: everything the platform knows about rooms, participants, and messages.
//
// The WebSocket layer (ws.ts) is one *subscriber* of the per-room "message" events emitted
// here. In M2 the MCP endpoint becomes a second subscriber — that is how a server-side
// notification reaches an agent's listener (ADR-0003 QST-AGENT-CONNECTION) without the
// WebSocket code knowing agents exist.
import { randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type pg from "pg";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type Participant,
  type ParticipantKind,
} from "../shared/protocol.ts";

/** A user-facing problem (bad input, unknown room) — safe to show to the client. */
export class RoomError extends Error {}

type MessageListener = (message: ChatMessage) => void;

export class RoomService {
  readonly #pool: pg.Pool;
  readonly #events = new EventEmitter();

  constructor(pool: pg.Pool) {
    this.#pool = pool;
    // Every open browser tab adds one listener per room; that is expected, not a leak.
    this.#events.setMaxListeners(0);
  }

  /** Create a room whose id is an unguessable 128-bit token: the link *is* the access. */
  async createRoom(): Promise<string> {
    const id = randomBytes(16).toString("base64url");
    await this.#pool.query("INSERT INTO rooms (id) VALUES ($1)", [id]);
    return id;
  }

  async addParticipant(
    roomId: string,
    kind: ParticipantKind,
    displayName: string,
  ): Promise<Participant> {
    const name = displayName.trim();
    if (!name) throw new RoomError("Please choose a name.");
    if (name.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new RoomError(`Names can be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`);
    }
    const id = randomUUID();
    try {
      await this.#pool.query(
        "INSERT INTO participants (id, room_id, kind, display_name) VALUES ($1, $2, $3, $4)",
        [id, roomId, kind, name],
      );
    } catch (err) {
      // 23503 = foreign_key_violation: the room id doesn't exist.
      if ((err as { code?: string }).code === "23503") throw new RoomError("This room doesn't exist.");
      throw err;
    }
    return { id, roomId, kind, displayName: name };
  }

  /** Store a message and notify every subscriber of its room. */
  async postMessage(participant: Participant, body: string): Promise<ChatMessage> {
    const text = body.trim();
    if (!text) throw new RoomError("Messages can't be empty.");
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new RoomError(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);
    }
    const { rows } = await this.#pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO messages (room_id, participant_id, body) VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [participant.roomId, participant.id, text],
    );
    const row = rows[0]!;
    const message: ChatMessage = {
      id: String(row.id),
      roomId: participant.roomId,
      participantId: participant.id,
      displayName: participant.displayName,
      kind: participant.kind,
      body: text,
      createdAt: row.created_at.toISOString(),
    };
    this.#events.emit(`message:${participant.roomId}`, message);
    return message;
  }

  /** The room's messages, oldest first (at most `limit`, the most recent ones). */
  async history(roomId: string, limit = 200): Promise<ChatMessage[]> {
    const { rows } = await this.#pool.query<{
      id: string;
      participant_id: string;
      display_name: string;
      kind: ParticipantKind;
      body: string;
      created_at: Date;
    }>(
      `SELECT * FROM (
         SELECT m.id, m.participant_id, p.display_name, p.kind, m.body, m.created_at
         FROM messages m JOIN participants p ON p.id = m.participant_id
         WHERE m.room_id = $1
         ORDER BY m.id DESC
         LIMIT $2
       ) recent ORDER BY id ASC`,
      [roomId, limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      roomId,
      participantId: r.participant_id,
      displayName: r.display_name,
      kind: r.kind,
      body: r.body,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** Subscribe to new messages in one room. Returns the unsubscribe function. */
  onMessage(roomId: string, listener: MessageListener): () => void {
    const event = `message:${roomId}`;
    this.#events.on(event, listener);
    return () => this.#events.off(event, listener);
  }
}
