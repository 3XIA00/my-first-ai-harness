<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# M2 — The MCP Endpoint Agents Connect To

- **Date**: 2026-11-19
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: 3XIA00; Saddler 5.5 (claude-opus-5-5)

**TL;DR**: The room server gains an MCP endpoint at `/mcp` (Streamable HTTP, bearer-token auth) with tools to join a room, read messages, and send messages, plus a subscribable room resource whose "updated" notification wakes the agent; phase 1 limits one agent to one room.

---

## Originating Context

**Source**: ADR-0003 Action Items (milestone **M2**), and 3XIA00 in chat (2026-11-19): *"For the which rooms the agent joins question, for now we can limit to 1 agent 1 room. In future phases, I think it can be reflected in the 'notification' like from room x, new message number 123: text123. (It does not have to be like this, just some simple examples)."*

Design inherited from ADR-0003 QST-AGENT-CONNECTION (answer B, 3XIA00's design): the agent connects over MCP and sets up a listener; when a room gets a new message, the server sends a notification through MCP; the listener wakes the agent.

**Agency Grant**: Saddler designs within those decisions; 3XIA00 rules on the questions below.

---

## Explicitation

**What I understand**:

1. **The MCP endpoint is a second subscriber to the same event the browser uses.** M1's `RoomService` emits a per-room `message` event, and the WebSocket code listens to it. M2 adds an MCP listener next to it. Nothing in M1 changes.
2. **One agent, one room (phase 1).** An agent may be in at most one room at a time; the server enforces it. Later phases lift the limit, and then the notification itself has to say *which* room changed (3XIA00's "from room x, message 123" example), so the design should carry the room in the notification from day one.
3. **The agent hears its own messages.** When the agent posts a reply, that's a new message in its room, so the server notifies the agent about its own reply. If the agent answered that, it would talk to itself forever. This is ADR-0001 QST-REPLY-LOOPS in miniature, and it exists even with one agent. Rule: every message carries its author's participant id, and the agent ignores messages it wrote.
4. **Identity.** The `/mcp` URL will be public at M4. A secret **agent token** proves "this caller is 3XIA00's agent" (ADR-0003 Open Follow-ups). The agent's display name comes from the server's configuration, not from the caller.

**Assumptions**:

- One agent exists in phase 1, so one token in the server's environment (`AGENT_TOKEN`, plus `AGENT_NAME`) is enough. A token table comes when other people's agents arrive.
- The TypeScript MCP SDK (`@modelcontextprotocol/sdk`, currently 1.32.2) provides the Streamable HTTP server transport, resource subscriptions, and `resources/updated` notifications. *To verify against the installed SDK when building; this is from training knowledge.*

**Confirm**: 3XIA00.

---

## Proposed design (Saddler 5.5)

**Transport**: MCP **Streamable HTTP** at `POST/GET/DELETE /mcp` on the existing room server (one process, one port). Stateful sessions: each connected agent gets a session id, which the server needs to know *who* to notify.

**Auth**: every `/mcp` request needs `Authorization: Bearer <AGENT_TOKEN>`; otherwise `401`. Compared in constant time.

**Tools** (what the agent can *do*):

| Tool | Input | Effect |
|---|---|---|
| `join_room` | `room_id` | Adds the agent as a participant (`kind = 'agent'`) and returns its participant id + recent messages. Phase-1 rule: if this agent is already in a different room, the call is refused. Re-joining the same room returns the existing participant (no duplicates after a reconnect). |
| `get_messages` | `room_id`, optional `after_id` | Messages in the room newer than `after_id`, oldest first. |
| `send_message` | `room_id`, `text` | Posts as the agent; appears in friends' browsers live. |

**Resource + notification** (how the agent is *woken*):

- Each joined room is a resource `room://<room_id>`. Reading it returns recent messages.
- The agent sends `resources/subscribe` for `room://<room_id>`. When any message lands in that room, the server sends `notifications/resources/updated` with that URI. The agent then calls `get_messages(after_id = last seen)` and replies to anything new that it didn't write. See QST-NOTIFY-SHAPE for whether the text should ride in the notification itself.

**Tested by**: an integration test with a real MCP client (the SDK's own client) against the real server and the Neon dev branch. Scenarios: wrong or missing token is rejected; joining → a browser message triggers a notification; `send_message` reaches the browser; a second room is refused; re-join after a reconnect doesn't duplicate the participant.

---

## Questions

### QST-ROOM-SHARING: With one agent in one room, how do friends use it?
- Status: unanswered
- Why asking: ADR-0003 planned phase 1 as *private* 1:1 chats, one room per friend. But "1 agent 1 room" means the agent is in exactly one room. Two friends who open that room's link are both in it and see each other's messages, which is phase 2's shared room arriving early. Nothing breaks either way; I'm checking which experience you intend, because it decides when the agent replies (in a shared room, does it answer every message, or only @mentions, per ADR-0003 QST-SPEAK-POLICY?).
- Need: pick a letter (or override — any shape answers)

Options:
- **A — One friend at a time**: the room is private in practice: you share its link with one friend for a test, and the agent replies to every message. For another friend, the agent leaves and joins a fresh room (you give it the new link). No code for shared-room behavior yet.
- **B — A shared room, every message answered**: all friends use the same link and the agent replies to every human message. Lively, but with several friends talking it's a lot of agent replies.
- **C — A shared room, @mention only**: all friends use the same link; the agent replies only when someone writes `@<agent name>`. That's phase 2's rule (ADR-0003 QST-SPEAK-POLICY A), adopted now.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**A — One friend at a time.** *Rationale*: It keeps phase 1 exactly what ADR-0003 said (1:1 chats, agent replies to every message, no @mention rule, per QST-PHASE1-MENTION), while respecting "1 agent 1 room." Switching friends costs one new link, cheap at toy scale. B and C both pull phase-2 behavior into phase 1. C is the better of the two if you *want* a group room now, because B's cost and noise grow with every friend in the room. *Confidence*: 0.65 — because A matches the written plan, but how you actually want to test with friends is your call. *If wrong*: if you'd rather invite several friends into one room right away, this flips to **C**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-NOTIFY-SHAPE: What does the "new message" notification carry?
- Status: unanswered
- Why asking: Your example, *"from room x, new message number 123: text123"*, puts the room, the message number, and the text *in the notification*. MCP has a standard notification for "this resource changed", `notifications/resources/updated`, but it carries only the resource's address (`room://x`), not the content; the client then reads what's new. MCP also allows a server to send its own custom notification type with any payload. The trade-off is interoperability vs. one fewer round-trip.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Standard `resources/updated`, then read**: the notification says "room x changed" (`room://x`); the agent calls `get_messages(room x, after = last seen id)` and gets message 123 and its text. Any MCP client that supports subscriptions understands it; it naturally names the room, which fits the multi-room future.
- **B — Custom notification with the message inside**: e.g. `notifications/room/message` with `{room_id: "x", message_id: 123, author, text: "text123"}`, exactly your example. One step instead of two. Only clients that know our custom type (i.e. our own harness) can use it.
- **C — Both**: send the standard one *and* the custom one. Our harness uses the custom payload; other clients fall back to the standard one plus a read.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**A — Standard `resources/updated`, then read.** *Rationale*: The final phase has *other people's* agents connecting (ADR-0001 QST-AGENT-INTEROP), likely through MCP clients we didn't write, and only the standard notification is guaranteed to mean something to them. A also gets your example's information: the room is in the URI, and the read returns message 123 with its text, with one extra request. That request is cheap and has a hidden benefit: if the agent was briefly disconnected and missed notifications, "everything after the last id I saw" catches up automatically, while a notification carrying a single message can't. B is simpler for our own harness only; C doubles the surface for little gain in phase 1. *Confidence*: 0.7 — because the standard path is clearly the interoperable one, but I haven't yet verified how the TypeScript SDK's client exposes `resources/updated` to application code. *If wrong*: if the SDK makes subscriptions awkward to receive in our harness, this flips to **B**, with a note to add A before other people's agents arrive.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

**Decided (3XIA00, chat, 2026-11-19)**: one agent, one room in phase 1; multi-room later, with the room identified in the notification.

Pending: QST-ROOM-SHARING, QST-NOTIFY-SHAPE. The proposed design above stands unless an answer changes it.

---

## Open Follow-ups

- [ ] Concern: the agent's own replies come back to it as notifications. The agent-side harness (M3) must skip messages whose `participantId` is its own, and M3's tests must cover it. This is the reply-loop problem with a single agent.
- [ ] Future task (multi-room phases): lift the one-room rule; one subscription per room; the notification URI already names the room.
- [ ] Future task (other people's agents): replace the single `AGENT_TOKEN` with per-agent tokens.

---

## Iterations

### Iteration 1 (2026-11-19)
- Trigger: M1 done; 3XIA00 said "yes" to starting ADR-0005, set "1 agent 1 room", and sketched the notification shape
- Contributors: 3XIA00 (room limit, notification idea), Saddler 5.5 (design, two questions)
- Changes: initial draft
- Outcome: Draft

---

## Links

- Implements milestone M2 of [ADR-0003](0003-step-1-shareable-web-chat-with-my-agent.md); connection design from ADR-0003 QST-AGENT-CONNECTION
- Builds on [ADR-0004](0004-m1-project-scaffold-and-humans-only-chat.md) (`RoomService` message events, participants table)
- Reply loops: [ADR-0001 QST-REPLY-LOOPS](0001-harness-scope-what-are-we-building.md)
