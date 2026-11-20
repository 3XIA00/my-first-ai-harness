<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# M3 — The Agent Harness

- **Date**: 2026-11-19
- **Iteration**: 2
- **Status**: Accepted
- **Deciders**: 3XIA00; Saddler 5.5 (claude-opus-5-5)

**TL;DR**: A program on 3XIA00's PC (`npm run agent -- <room link>`) that connects to `/mcp`, joins one room, and on each update notification reads what's new, skips its own messages, asks Claude Haiku 5.5 (via OpenRouter) for a reply in the persona 3XIA00 writes, and posts it. Three questions: persona, how to call OpenRouter, how much history the model sees.

---

## Originating Context

**Source**: ADR-0003 Action Items (milestone **M3**). 3XIA00 said "yes, write ADR-0006" (chat, 2026-11-19) after running the M2 loop by hand in the MCP Inspector, which is the exact sequence this program automates.

Decisions this ADR builds on, all by 3XIA00:

- Agents run on their owners' machines and join through our MCP server (ADR-0001 QST-AGENT-INTEROP); the listener stays (ADR-0003 QST-AGENT-HOSTED).
- One reply per human message, no tools, no @mention in 1:1 (ADR-0003 QST-AGENT-ENGINE C, QST-PHASE1-MENTION A; ADR-0005 QST-ROOM-SHARING A).
- Woken by the standard `notifications/resources/updated`, then `get_messages(after_id)` (ADR-0005 QST-NOTIFY-SHAPE A).
- Model: Claude Haiku 5.5 at low effort, paid with the professor's OpenRouter key (ADR-0003 QST-MODEL-ACCESS A, QST-AGENT-MODEL C). The key is in `.env` as `OPENROUTER_KEY`.

**Verified 2026-11-19** from OpenRouter's public model list: id `anthropic/claude-haiku-5.5`, 1M context, $0.10 / $0.50 per million tokens in/out, supports `reasoning_effort`.

**Agency Grant**: Saddler designs the loop within those decisions; 3XIA00 rules on the questions.

---

## Explicitation

**What I understand**:

1. **This is the harness, the part the project is for.** Everything before it (room server, MCP endpoint) is the *place*; this is the *mind's body*: the program that decides when the model runs, what the model sees, and what happens to its output.
2. **The model never sees MCP.** In phase 1 the agent has no tools (ADR-0003 QST-AGENT-ENGINE C). The *harness* calls the MCP tools; the model only receives a conversation and returns text. That's a deliberate split: what the harness does is fixed code; what the model does is choose words.
3. **Three timing problems a chat harness must handle**, none of which the Inspector walkthrough exposed because a human was clicking slowly:
   - **Bursts**: a friend sends three messages quickly → three notifications while the model is still thinking about the first. Answering each separately would produce three replies talking over each other.
   - **Its own echo**: the agent's reply triggers a notification too (ADR-0005 Explicitation 3).
   - **Missed messages**: if the agent was offline when the friend wrote, nothing will ever notify it about those messages.

**Assumptions**:

- The agent and the room server share `.env` while both run on 3XIA00's PC. At M4 the server's copy of `AGENT_TOKEN` moves to Render's settings, and the agent's copy stays local.
- A friend's conversation is short (tens of messages), so cost per reply is tiny at Haiku 5.5 prices (QST-HISTORY-WINDOW has the numbers).

**Confirm**: 3XIA00.

---

## Proposed design (Saddler 5.5)

**Files** (`src/agent/`):

| File | Role |
|---|---|
| `index.ts` | Entry point: `npm run agent -- <room link or id>`. Reads `.env`, starts the harness, stops cleanly on Ctrl+C (leaves the room). |
| `harness.ts` | The loop, as a class that gets its model call passed in (so tests can run the loop without spending tokens). |
| `llm.ts` | `generateReply(conversation) → text`: the only file that knows about OpenRouter (QST-LLM-CLIENT). |
| `persona.md` | The agent's system prompt, in plain words, editable without touching code (QST-PERSONA). |

**Configuration** (`.env`): `OPENROUTER_KEY` (exists), `AGENT_TOKEN` (exists), optional `ROOM_SERVER_URL` (default `http://localhost:3001`), optional `AGENT_MODEL` (default `anthropic/claude-haiku-5.5`).

**The loop**:

1. **Connect** to `<ROOM_SERVER_URL>/mcp` with `Authorization: Bearer <AGENT_TOKEN>`.
2. **Join**: `join_room(room)` → remember `participant_id` (= *me*) and the newest message id (= *last seen*).
3. **Catch up once**: if the newest message is from a human (someone wrote while the agent was offline), reply to it now.
4. **Subscribe** to `room://<room>`.
5. **On each notification**, run one *turn*. Turns never overlap: if notifications arrive mid-turn, exactly one more turn runs afterwards. That handles bursts.
   1. `get_messages(after_id = last seen)` → advance *last seen*.
   2. If none of the new messages are from a human (e.g. it's only my own echo), stop. **Never reply to myself.**
   3. Build the conversation (QST-HISTORY-WINDOW): my messages → `assistant`; humans' messages → `user`, as `"<name>: <text>"` so the model knows who's talking. Consecutive same-role messages are merged.
   4. `generateReply(persona + conversation)` → `send_message`.
6. **If the model call fails** (network, rate limit, credit used up): log it and post nothing. The friend's message stays unanswered rather than the agent crashing. The next human message retries.
7. **If the connection drops**: reconnect with backoff, re-join (same room → same participant, ADR-0005), and catch up via `after_id`.

**Tests**:

- **The loop**, against the real server + dev branch with a deterministic stand-in model (`"echo: <last human line>"`): friend writes → one reply; no reply to its own echo; a burst of three → the reply reflects all three, never three overlapping replies; messages written while the agent was offline get a reply on start.
- **The stand-in's contract** is exactly the real one (conversation in, text out, may throw). Per the vignette *The Stub That Agreed With the Bug*, it doesn't fake anything the loop inspects beyond that.
- **One live test** against OpenRouter (`npm run test:live`, about $0.0003 per run), opt-in and **not** in `just gate`, so the gate never spends credit or fails when OpenRouter is down.

---

## Questions

### QST-PERSONA: Who is the agent?
- Status: answered
- Why asking: The system prompt decides how TESTIE1 talks: tone, what it's for, what it won't do. It's the part of this project friends actually experience, and the most personal decision in it. It will live in `src/agent/persona.md`, plain text you can edit any time without code changes.
- Need: pick a letter (or override — any shape answers); for B, a sentence or two about the vibe you want helps

Options:
- **A — You write it from scratch**: I create an empty `persona.md` with a few headings (who you are, how you talk, what you won't do), and you fill it in before the first run.
- **B — I draft, you edit**: I write a short starter persona from a brief you give (e.g. "a friendly, slightly playful study buddy who keeps answers short"); you edit it freely afterwards.
- **C — A neutral default for now**: "You are TESTIE1, a friendly assistant chatting with a friend of 3XIA00's. Keep replies short." Personalize later.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**B — I draft, you edit.** *Rationale*: A blank page is the hardest place to start, and C postpones the most personal part of the project. A draft gives you something concrete to react to, and it can carry two things friends won't notice until they're missing: keep replies short (it's a chat, not an essay), and don't claim abilities it doesn't have (it has no tools: no web, no memory beyond this room). *Confidence*: 0.7 — because a draft is usually the fastest route to a voice you like, but you may already have a clear picture, in which case A is better. *If wrong*: if you already know exactly who TESTIE1 is, this flips to **A**.

**ANS:** (by 3XIA00)
B. Here are some ideas for you to start with. A friendly chat bot who answers questions but not supporting with complex tasks like coding. Users can chat with the agent about daily life, brainstorming etc.(Model is Haiku 5.5 through openrouter so honestly, I think that is the best he can do)

---

### QST-LLM-CLIENT: How does the harness call OpenRouter?
- Status: answered
- Why asking: `llm.ts` is the one place that talks to the model. OpenRouter accepts the widely used "chat completions" request format (OpenAI-style) at `https://openrouter.ai/api/v1/chat/completions`, and also offers its own SDKs. The choice affects how much of the model call you can see and how many dependencies we add.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Plain `fetch`, written by us**: about 30 lines: build the JSON request (model, messages, `reasoning_effort: "low"`, `max_tokens`), POST it with the key, read the reply text, turn HTTP errors into clear messages. No new dependency; every byte sent to the model is visible in our code.
- **B — OpenRouter's TypeScript SDK** (`@openrouter/sdk`): typed requests and responses, retries handled for us. One more dependency; the request is shaped by the SDK.
- **C — OpenAI's SDK pointed at OpenRouter**: OpenRouter documents this as a drop-in. The most tutorials online, but an OpenAI library calling Claude through a router is three layers of indirection for a ~30-line call.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**A — Plain `fetch`.** *Rationale*: This project's goal is to understand harnesses (ADR-0001), and the model call is the heart of one. With `fetch` you can read exactly what the model receives and returns, including the HTTP status codes you'll hit when the $10 runs low (OpenRouter returns `402 Payment Required`). Node 26 has `fetch` built in, so it costs zero dependencies. Retries aren't needed in phase 1: a failed reply is logged and the next message retries (design step 6). The one-function boundary from ADR-0003 QST-MODEL-ACCESS means switching to B later changes one file. *Confidence*: 0.75 — because the call is small and stable and visibility is the stated goal; B would win if we needed streaming or tool calls, which phase 1 doesn't. *If wrong*: if phase 2+ adds tools or streaming replies, this flips to **B**.

**ANS:** (by 3XIA00)
A. If I am understanding right, with A we can get every information through the process so that we can customize our error handlers.

---

### QST-HISTORY-WINDOW: How much of the conversation does the model see on each reply?
- Status: answered
- Why asking: The model has no memory of its own. On every reply the harness re-sends the conversation, and the model "remembers" exactly what's in it. More history means better continuity and more tokens per reply. Rough cost per reply at Haiku 5.5 prices (persona ~300 tokens, ~40 tokens per chat message, ~200-token reply):
  - last **20** messages: ≈ 1,100 tokens in → ≈ **$0.0002**/reply → ~45,000 replies per $10
  - last **50** messages: ≈ 2,300 tokens in → ≈ **$0.0003**/reply → ~30,000 replies per $10
  - **everything**: grows with the conversation; at 500 messages ≈ $0.002/reply, and old messages slowly crowd the context
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Last 20 messages**: remembers the current topic; may forget something said an hour ago in a long chat.
- **B — Last 50 messages**: remembers most of a long conversation; still cheap.
- **C — Everything in the room**: never forgets anything said in this room; cost and prompt size grow with the chat.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**B — Last 50 messages.** *Rationale*: At Haiku 5.5 prices the difference between 20 and 50 is a hundredth of a cent per reply, so cost doesn't decide this. Forgetting what a friend said ten minutes ago is the kind of failure friends *do* notice, so the larger window is worth it. C has no ceiling, which a fixed window does. 50 is also the most `get_messages` returns per call (its default), so one call fills the window. *Confidence*: 0.7 — because the cost math is solid, but "how long are your friends' chats" is a guess. *If wrong*: if friends' chats turn out to be long sessions where early context matters (e.g. planning something over an evening), this flips to **C** with a cap.

**ANS:** (by 3XIA00)
B. Maybe we will modify the number or even add compression when we move to future phases. So make sure the code is flexible.

---

## Decision

**Chosen**: the proposed design, with:
- **Persona** (QST-PERSONA B): Saddler drafts `src/agent/persona.md` from 3XIA00's brief: *"A friendly chat bot who answers questions but not supporting with complex tasks like coding. Users can chat with the agent about daily life, brainstorming etc."* 3XIA00 edits freely. 3XIA00's note on scope: Haiku 5.5 is a small model, and the persona should play to that (light conversation) rather than pretend otherwise.
- **Model call** (QST-LLM-CLIENT A): plain `fetch` to OpenRouter in `src/agent/llm.ts`. 3XIA00's reading, confirmed: owning the HTTP call means every status code and error body is visible, so each failure (bad key 401, credit out 402, rate limit 429, provider down 5xx) gets its own clear handling.
- **History** (QST-HISTORY-WINDOW B): the last **50** messages, as a configurable setting (`AGENT_HISTORY` in `.env`, default 50), with the conversation built in one function (`buildConversation`), so a future phase can change the number or add compression (e.g. summarizing older messages) in one place.

**Status of the answers' statuses**: all three answered by 3XIA00 on 2026-11-19.

---

## Open Follow-ups

- [ ] Concern: the agent has no persistent memory across rooms or restarts beyond the room's own history. That's by design in phase 1 (one room = one context, ADR-0005's per-room listeners note). Worth revisiting if friends expect it to remember them.
- [ ] Concern: OpenRouter credit. When the $10 runs out, calls fail with HTTP 402. The harness logs it and stays silent, so friends see no reply. A visible "agent is resting" message is a possible later addition.
- [ ] Future task (phase 2): the speak policy moves into the harness (reply only on @mention), then "agent decides" (final). Turn processing (design step 5) is where that rule plugs in.

---

## Iterations

### Iteration 1 (2026-11-19)
- Trigger: M2 done; 3XIA00 asked for ADR-0006
- Contributors: Saddler 5.5 (design, three questions, OpenRouter model facts verified from its public model list)
- Changes: initial draft
- Outcome: Draft

### Iteration 2 (2026-11-19)
- Trigger: 3XIA00 answered all three questions (B, A, B)
- Contributors: 3XIA00 (answers, persona brief), Saddler 5.5 (Decision)
- Changes: Decision filled; history window made configurable per 3XIA00's "make sure the code is flexible"
- Outcome: Draft → Accepted

### Iteration 3 (2026-11-19)
- Trigger: M3 implemented
- Contributors: Saddler 5.5
- Changes: built as designed (`src/agent/`: `index.ts`, `harness.ts`, `conversation.ts`, `llm.ts`, `persona.md`). Two additions beyond the design:
  1. **Automatic room switching.** If a crash left the agent in another room, `join_room`'s refusal names that room; the harness leaves it and joins the new one, since "one friend at a time" makes switching the normal case.
  2. **Conversations never open with the agent's own reply** (a window can cut off the question it answered).
- **Mutation checks**: removing the "only reply if a human spoke" rule fails 2 tests (the agent answers itself); allowing turns to overlap fails the burst test (3 concurrent model calls seen).
- The live OpenRouter test is opt-in (`npm run test:live`, `LIVE=1`) and excluded from `just gate`. It was not run by Saddler, since it spends 3XIA00's credit.
- Outcome: stays Accepted; M3 awaiting 3XIA00's live test and a real chat

---

## Links

- Implements milestone M3 of [ADR-0003](0003-step-1-shareable-web-chat-with-my-agent.md)
- Uses the endpoint from [ADR-0005](0005-m2-mcp-endpoint-for-agents.md)
- Scope and interop: [ADR-0001](0001-harness-scope-what-are-we-building.md)
- Testing lesson: [`docs/vignettes/2026-11-19-the-stub-that-agreed-with-the-bug.md`](../vignettes/2026-11-19-the-stub-that-agreed-with-the-bug.md)
