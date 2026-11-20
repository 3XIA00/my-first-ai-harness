// What the model sees: room messages turned into a chat conversation (ADR-0006).
//
// The model has no memory of its own. On every reply the harness re-sends this conversation,
// and the model "remembers" exactly what's in it. This is the one place that decides what
// goes in, so a future phase can change the window or add compression (ADR-0006
// QST-HISTORY-WINDOW: "make sure the code is flexible").
import type { ChatMessage } from "../shared/protocol.ts";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Map room messages to model turns: my own messages are `assistant`; everyone else's are
 * `user`, written "Name: text" so the model knows who's speaking. Consecutive messages with
 * the same role are merged (two quick lines from a friend become one turn), because chat APIs
 * expect user and assistant turns to alternate. Only the last `windowSize` messages are used.
 */
export function buildConversation(
  messages: ChatMessage[],
  myParticipantId: string,
  windowSize: number,
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const m of messages.slice(-windowSize)) {
    const role = m.participantId === myParticipantId ? "assistant" : "user";
    const content = role === "assistant" ? m.body : `${m.displayName}: ${m.body}`;
    const last = turns.at(-1);
    if (last?.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  }
  // A conversation must start with the user; drop a leading reply whose prompt fell out of
  // the window.
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}
