// The one definition of what a room, a participant, and a message look like, and of every
// message the browser and the room server exchange over the WebSocket. Both src/server and
// src/client import this file, so a change to a shape here is a compile error everywhere it
// breaks (ADR-0002 QST-CAN-WE-USE-TYPESCRIPT--J).

/** Humans and agents are the same kind of thing in a room (ADR-0003 Consequences). */
export type ParticipantKind = "human" | "agent";

export interface Participant {
  id: string;
  roomId: string;
  kind: ParticipantKind;
  displayName: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  participantId: string;
  /** Copied onto each message so a client can render it without a separate lookup. */
  displayName: string;
  kind: ParticipantKind;
  body: string;
  /** ISO-8601 timestamp, set by the server. */
  createdAt: string;
}

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_DISPLAY_NAME_LENGTH = 40;

// ---- browser → server -------------------------------------------------------------------

export type ClientEvent =
  | { type: "join"; roomId: string; displayName: string }
  | { type: "send"; body: string };

// ---- server → browser -------------------------------------------------------------------

export type ServerEvent =
  | { type: "joined"; participant: Participant; history: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "error"; error: string };

// ---- HTTP -------------------------------------------------------------------------------

/** Response of `POST /api/rooms`. */
export interface CreateRoomResponse {
  roomId: string;
}
