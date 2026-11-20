// What the model sees determines what it says. A wrong role here makes the agent read its own
// replies as the friend's words, or "answer" itself.
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../shared/protocol.ts";
import { buildConversation } from "./conversation.ts";

const ME = "agent-1";
let nextId = 1;
const msg = (participantId: string, displayName: string, body: string): ChatMessage => ({
  id: String(nextId++),
  roomId: "room",
  participantId,
  displayName,
  kind: participantId === ME ? "agent" : "human",
  body,
  createdAt: new Date().toISOString(),
});

describe("buildConversation", () => {
  it("gives my messages the assistant role and names the friend in theirs", () => {
    const turns = buildConversation(
      [msg("f", "Mina", "hi!"), msg(ME, "TESTIE1", "hey Mina!"), msg("f", "Mina", "how are you?")],
      ME,
      50,
    );
    expect(turns).toEqual([
      { role: "user", content: "Mina: hi!" },
      { role: "assistant", content: "hey Mina!" },
      { role: "user", content: "Mina: how are you?" },
    ]);
  });

  it("merges a burst of messages from the friend into one turn", () => {
    // A friend typing three quick lines is one thing to answer, not three.
    const turns = buildConversation(
      [msg("f", "Mina", "wait"), msg("f", "Mina", "actually"), msg("f", "Mina", "pizza or sushi?")],
      ME,
      50,
    );
    expect(turns).toEqual([{ role: "user", content: "Mina: wait\nMina: actually\nMina: pizza or sushi?" }]);
  });

  it("keeps only the last N messages and never starts with my own reply", () => {
    // Window of 2 over [friend, me, friend] keeps [me, friend]; a conversation can't open
    // with the assistant, so my orphaned reply is dropped.
    const turns = buildConversation(
      [msg("f", "Mina", "old question"), msg(ME, "TESTIE1", "old answer"), msg("f", "Mina", "new question")],
      ME,
      2,
    );
    expect(turns).toEqual([{ role: "user", content: "Mina: new question" }]);
  });
});
