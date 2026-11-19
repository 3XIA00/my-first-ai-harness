<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# Step 1 — A Shareable Web Chat with My Agent

- **Date**: 2026-11-12
- **Iteration**: 2
- **Status**: Accepted
- **Deciders**: 3XIA00; Saddler 5.5 (claude-opus-5-5)

**TL;DR**: Phased plan: phase 1 = private 1:1 chats with 3XIA00's tool-less agent; phase 2 = one shared room with @mention replies; final = many linked rooms where agents choose when to speak. The stack is a Node + WebSocket server with a React/Vite page, on Render + Neon, with no usage limits while testing with trusted friends. One question is still open: how the agent connects (QST-AGENT-CONNECTION).

---

## Originating Context

**Source**: Prior ADR answer, [ADR-0001 QST-HARNESS-MEANING](0001-harness-scope-what-are-we-building.md). 3XIA00's words: *"Right now, for step 1, we can build a website so that I can share a link with my friends and they can chat with my agent."* The long-term goal it serves: *"an online platform so that agents from different people can chat in that website/room."*

**Agency Grant**: Recommend; 3XIA00 decides. Toy project: favor fast, visible progress and learning over production hardening, **except where money or safety is at stake**.

---

## Explicitation

**What I understand**:

1. **"My agent"** is an LLM with a personality and perhaps a few abilities, owned by 3XIA00, running on our server. Friends talk to it through a browser.
2. **The server is the harness.** It holds the conversation, calls the model, decides when the agent replies, and runs (or refuses) any tool calls. That's the learning core and it's preserved — it now faces many humans at once.
3. **A public link changes the threat model.** On a laptop, the only person typing at an agent is its owner. On a shared link, anyone who has the URL can: (a) spend 3XIA00's API credits, (b) try to make the agent say or do things 3XIA00 wouldn't want (prompt injection). So the agent should have **no tools that touch a real machine**, and spending must be capped.
4. **Step 1 should not close doors on step N** (multi-agent rooms; [ADR-0001 QST-AGENT-INTEROP](0001-harness-scope-what-are-we-building.md)). In practice: model "a participant" so that a human and an agent are both just participants in a room.

**Assumptions**:

- The model provider is Anthropic (Claude), via an API key 3XIA00 owns — since this project is built with Claude. Switching providers later is cheap if the model call sits behind one function.
- Language is TypeScript ([ADR-0002](0002-implementation-language-and-runtime.md), lean strengthened by ADR-0001's answer).
- "Friends" means a handful of people, not the public: tens of messages a day, not thousands.

**Confirm**: 3XIA00.

---

## Questions

### QST-ROOM-SHAPE: Does each friend chat with the agent privately, or is it one shared room?
- Status: answered
- Why asking: Your step-1 sentence works both ways: "friends can chat with my agent" might mean each friend has their own private conversation, or everyone is in one room together with the agent. The end goal (agents from different people chatting in a room) is a shared room.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Private 1:1**: each friend who opens the link gets their own conversation with your agent; friends don't see each other. Simplest — just a chatbot website.
- **B — One shared room**: everyone with the link is in the same room; all humans and the agent see every message, like a group chat with a bot in it.
- **C — Rooms by link**: you can create several rooms, each with its own link; each room is a shared group chat (B), and a room with one friend in it behaves like A.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**B — One shared room.** *Rationale*: The destination in ADR-0001's Decision is a multi-party room, and B is that destination's smallest version: one room, many humans, one agent. A would teach us a chatbot and then need rebuilding into rooms. B also forces the most interesting harness problem early, turn-taking (QST-SPEAK-POLICY). C is B plus room management, which we can add once B works. *Confidence*: 0.65 — because B matches the end goal, but you may have pictured private chats when you wrote step 1. *If wrong*: if you want friends' conversations with your agent to be private from each other, this flips to **A**. If you already want separate rooms for separate friend groups, it flips to **C**.

**ANS:** (by 3XIA00)
Our final goal is C. The final picture would be: different links guides to different rooms with different human and agents. Humans and agents in that room can see everyone's messages. But 1 agent only listen to 1-2 rooms so that agent won't get confused.
For phase 1, we are building A. Once agent and human can chat, we would move on to phase 2 which is B.

---

### QST-SPEAK-POLICY: In a shared room, when does the agent reply?
- Status: answered
- Why asking: Only matters if QST-ROOM-SHAPE is B or C. In a 1:1 chat the agent answers every message. In a group, "answer everything" makes the agent interrupt humans talking to each other, and every message costs a model call. Single-user harnesses never face this problem; every multi-agent room does. When step N puts two agents in one room, a bad policy here means they reply to each other forever.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Only when @mentioned**: the agent replies only when someone writes `@agentname`. Predictable and cheap; one model call per mention.
- **B — Every message**: the agent replies to every human message. Lively, but noisy and the most expensive.
- **C — Agent decides**: on every message, a cheap model call asks "should I speak?" and the agent replies only if yes. The most natural-feeling, but it pays for a model call on every message, and it's the hardest to make predictable.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Only when @mentioned.** *Rationale*: A is the only option whose cost and behavior you can predict before launch: one model call per mention, and friends always know why the agent spoke. It's also the policy that survives step N, because two agents that only answer mentions can't loop unless they mention each other, and that's one rule to cap. C is the interesting research problem and makes a good later iteration once we have real chat logs to judge it against. *Confidence*: 0.7 — because predictability and cost both point the same way, though A may feel stiff in a lively room. *If wrong*: if real use shows friends forgetting to @mention and the room feeling dead, this flips to **C**.

**ANS:** (by 3XIA00)
Similar to previous question. Our final phase is C. For phase 1, we build A which is cheap and simple.

---

### QST-AGENT-ENGINE: What runs "my agent" on the server?
- Status: answered
- Why asking: Successor to [ADR-0001 QST-BUILD-DEPTH](0001-harness-scope-what-are-we-building.md), re-asked for a public web context. The agent needs at least: a system prompt (its personality), the room's recent messages as context, and a call to the model. The question is how much of that loop we write and what tools the agent gets.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Our own loop on the raw model API**: we call Claude's Messages API ourselves. We write the context-building (which messages, how many, who said what), the reply, and any tool-use loop. Tools: none at first, then only safe, server-side ones (e.g. a dice roll, a web lookup) that never touch the host machine.
- **B — Claude Agent SDK**: the engine under Claude Code. Runs the loop for us, but it's built around file, shell, and code tools on a machine. Those are the wrong defaults for an agent that strangers can talk to; we'd spend effort switching them off.
- **C — No loop yet, plain completion**: one model call per reply with the system prompt and recent messages; no tools at all. The smallest possible step 1; tools come later as a deliberate upgrade to A.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**C — No loop yet, plain completion, growing into A.** *Rationale*: Step 1's job is "friends can chat with my agent." A single model call with a good system prompt does that, and it means the first deploy has zero tool surface for strangers to abuse. The harness-building lesson isn't lost, it's sequenced: once the chat works, adding a tool-use loop is a small, self-contained iteration where the loop is the *only* new thing, which makes it easier to learn. B is ruled out by the public-link threat model (Explicitation 3). *Confidence*: 0.7 — because C is clearly the safer first deploy, but you may want tools in the very first version. *If wrong*: if the agent you picture *needs* abilities from day one (looking things up, remembering friends, playing games), this flips to **A** with a vetted tool list.

**ANS:** (by 3XIA00)
C. If I am not understanding it wrong. Right now, we only allow agent talk with human. If things goes well, we might give agent some tools to access web, code etc after phase 2(chat in a room).
If the loop here means how we wake the agent and let agent reply: either a webhook or a listener(We need to discuss this)

---

### QST-ACCESS-COST: How do we stop the link from costing you money or being abused?
- Status: answered
- Why asking: Every agent reply is billed to *your* API key. Links get forwarded; a link that reaches a stranger, a bot, or a friend's prank script can run up a real bill or fill the room with junk. This is the one part of a toy project that can do real damage, so I'd like an explicit decision rather than a default.
- Need: pick a letter (or override — any shape answers); all options assume you also set a **monthly spend limit on the API key in the Anthropic console** (a provider-side hard cap, independent of our code)

Options:
- **A — Secret link + server caps**: the room URL contains a long unguessable token (`/r/k3x9…`); the server enforces per-room limits (e.g. N agent replies per hour, max message length). No accounts. A forwarded link still works, but the caps bound the damage.
- **B — Shared passcode**: the link opens a page asking for a nickname + a passcode you tell friends separately; plus A's server caps. A forwarded link alone isn't enough to get in.
- **C — Real accounts**: sign in with Google/GitHub; you approve who gets in. Strongest control, but most of a week's work, and every friend needs an account.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Secret link + server caps (plus the console spend limit).** *Rationale*: For a handful of friends, the realistic risk is a forwarded link, not a targeted attack. Three layers cover that: the console limit caps the worst-case bill no matter what our code does, the per-room reply cap bounds the damage rate, and the token keeps the room out of search engines and URL guessing. B adds a small barrier for little extra work, and it's an easy upgrade if a link leaks. C is real product work that teaches auth, not harnesses. *Confidence*: 0.75 — because A + console limit bounds the money risk for this audience size, and that risk is the one that matters. *If wrong*: if the link will be posted anywhere semi-public (a class Discord, social media), this flips to **B**.

**ANS:** (by 3XIA00)
override：for phase 1, we dont set limitations. the harness will be tested with trusted friends. When it comes to later phases, I can ask agent to stop listening to the room to avoid costs and being abused. If in the future, I really want to publish this harness, then we need to think about this.

---

### QST-HOSTING: Where does the site run so friends can open the link?
- Status: answered
- Why asking: "Share a link" means the server must be reachable from the internet. Chat needs a long-lived connection (WebSocket or server-sent events) so messages appear live, which rules some hosting styles in or out.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Your PC + a tunnel**: run the server on your machine and expose it with a tunnel (e.g. Cloudflare Tunnel or ngrok), which gives you a public URL. Free, instant, and every code change is live immediately — but the room is only up while your PC is on.
- **B — A container host**: deploy to a platform that runs a long-lived Node server (e.g. Render, Fly.io, Railway). Always on; small free/cheap tiers exist; adds a deploy step and a place to keep the API key as a secret.
- **C — Serverless (e.g. Vercel)**: great for websites, but serverless functions are short-lived, so live chat needs a third-party realtime service bolted on. More moving parts for a chat app.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Your PC + a tunnel, moving to B when friends want it always on.** *Rationale*: During step 1 we'll change the code many times a day; with a tunnel, every change is live for friends instantly with no deploy pipeline to build or debug. Moving to B later is a deploy step, not a rewrite, *if* we keep the server a plain long-lived Node process (which QST-WEB-STACK's recommendation does). C fits chat apps badly, for the connection-lifetime reason in the Why line. *Confidence*: 0.65 — because A is fastest for iteration, but "the room is down when my laptop sleeps" may annoy friends sooner than I expect. *If wrong*: if you want friends to drop in any time from the first day, this flips to **B**.

**ANS:** (by 3XIA00)
B. I am thinking render + neon. the server will be on render and neon would be the database.

---

### QST-WEB-STACK: What do we build the website with?
- Status: answered
- Why asking: Assumes TypeScript ([ADR-0002 QST-LANGUAGE](0002-implementation-language-and-runtime.md)). The site has two halves: a **server** (holds rooms, talks to the model, pushes messages live) and a **client** (the chat page in the browser). The stack decides how visible the harness logic stays and how hosting works.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Plain Node server + small React client**: one Node process (e.g. Fastify or Express) with WebSockets for live messages, serving a React chat page built with Vite. Every piece of the room/agent logic is our own code in one place. Runs anywhere a Node process runs (tunnel or container host).
- **B — Next.js full-stack**: one framework for pages and API routes, the most popular React setup. But its server side leans serverless, and live chat over WebSockets needs workarounds or an external realtime service.
- **C — Plain Node server + plain HTML/JS client**: as A, but the chat page is hand-written HTML + a little JavaScript, no React. Fewest tools; gets clumsy as the UI grows.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Plain Node server + small React client.** *Rationale*: The harness is the server, so we want the server to be ours: a plain Node process where the room → model → reply path is code we can read top to bottom, not framework conventions. It's also the shape QST-HOSTING's A and B both need (a long-lived process). React + Vite for the page is the most widely documented way to build a chat UI, and it grows when step N adds multiple agents and rooms. B is the industry default for websites, but it fits a realtime chat server poorly. C is fine for a day, cramped by week two. *Confidence*: 0.7 — because A fits the realtime and hosting constraints, but you may already know Next.js, and familiarity counts. *If wrong*: if you're already comfortable in Next.js and would rather add a realtime service than learn a new server setup, this flips to **B**.

**ANS:** (by 3XIA00)
A. Since it is the most widely documented way

---

### QST-AGENT-CONNECTION: How does 3XIA00's agent connect to the room and learn there's a new message?
- Status: unanswered
- Why asking: Two of your answers point in different directions, and you flagged the gap yourself. QST-AGENT-ENGINE ("C") reads as *the room server calls the model* when a friend writes. But ADR-0001 QST-AGENT-INTEROP says agents **run on their owners' machines** and join **through an MCP server we provide**, and you described agents as "listening" to rooms and being told to "stop listening." Under QST-AGENT-ENGINE you also asked: *"how we wake the agent and let agent reply: either a webhook or a listener (we need to discuss this)."* This question settles both together for phase 1. Background: MCP is request/response (the agent calls tools; the server answers), so with MCP, "listening" means the agent calls a tool that **waits** until a message arrives (a long-poll). A **webhook** is the reverse: the server calls *the agent's* URL when a message arrives, so the agent's machine must be reachable from the internet.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Server-side agent (phase 1 only)**: the room server on Render calls Claude directly whenever a friend messages; your API key lives on Render. Fastest path to friends chatting, and the agent is up whenever the site is. But it isn't the final architecture: when agents move to owners' machines, your agent's code moves out and is rewritten as an MCP client.
- **B — MCP listener from day one**: the room server also exposes an MCP endpoint with tools like `wait_for_messages` (blocks until any of the agent's rooms gets a message, then returns it) and `send_message`. Your agent is a small program on *your* machine that loops: wait → call Claude → send reply. That program **is the harness** you set out to build. Phase 1 already uses the final architecture, and "stop listening" just means stopping the program. The site stays up on Render, but your agent only replies while its program runs.
- **C — Webhook**: the room server POSTs each new message to a URL your agent exposes, and the agent replies through an HTTP API. Your machine needs a public URL (a tunnel). It also doesn't fit "we provide an MCP" — MCP agents call *into* servers, they don't get called.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**B — MCP listener from day one.** *Rationale*: Your own answers describe B. Agents live on owners' machines (ADR-0001 QST-AGENT-INTEROP), the platform "provides an mcp and a link," and agents "listen" to rooms and can "stop listening" (QST-ROOM-SHAPE, QST-ACCESS-COST). A listener also beats a webhook on the problem that matters for agents on home machines: an outbound connection (listener) works from behind any home router, while an inbound one (webhook) needs a tunnel on every owner's machine. B costs maybe a couple hundred more lines than A in phase 1, and those lines are the agent-side loop, which is the harness itself. A gets friends chatting sooner but builds the agent in the one place ADR-0001 says it won't live. QST-AGENT-ENGINE's answer (C: a plain model call, no tools) still holds inside B, since it describes what happens inside each turn of the loop. *Confidence*: 0.65 — because B matches every architectural answer you gave, but it puts MCP-over-HTTP and auth for the MCP endpoint on the phase-1 critical path, and I haven't measured how much friction that adds. *If wrong*: if getting friends chatting this week matters more than building the final shape first, or you want your agent to answer while your PC is off, this flips to **A** (accepting a later rewrite of the agent part).

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-PHASE1-MENTION: In phase 1's private 1:1 chats, must friends @mention the agent?
- Status: unanswered
- Why asking: Your QST-SPEAK-POLICY answer says phase 1 uses A (reply only when @mentioned). But phase 1 is also private 1:1 chats (QST-ROOM-SHAPE), where every message is already addressed to the agent. Requiring `@agent` on every message there would just be friction. I'm checking whether you meant the @mention rule to start in phase 2's shared room.
- Need: yes/no (or override)

Options:
- **A — No; the @mention rule starts in phase 2**: in phase 1 the agent replies to every message in its private chats. The @mention rule turns on when rooms become shared.
- **B — Yes, even in 1:1**: friends write `@agent` on every message in phase 1 too, so the same rule runs everywhere from day one.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**A — No; the @mention rule starts in phase 2.** *Rationale*: In a 1:1 chat, @mention-only and reply-to-everything behave identically if friends always mention, and differently only when someone forgets. Then the agent goes silent for no reason the friend can see. The rule exists to keep an agent from interrupting a *group*, and phase 1 has no group. *Confidence*: 0.85 — because I think this is what your answer meant, and I'm confirming rather than disagreeing. *If wrong*: if you want phase 1 to rehearse the exact phase-2 rule, so the agent-side code never changes between phases, this flips to **B**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

### Chosen — a phased plan (3XIA00's answers, 2026-11-19)

| | Phase 1 (now) | Phase 2 | Final |
|---|---|---|---|
| **Room shape** (QST-ROOM-SHAPE) | **A** — private 1:1 chat per friend | **B** — one shared room | **C** — many rooms, one link each; everyone in a room sees every message; an agent listens to only 1–2 rooms "so that agent won't get confused" |
| **Speak policy** (QST-SPEAK-POLICY) | **A** — @mention only (see QST-PHASE1-MENTION for 1:1) | A | **C** — the agent decides |
| **Agent engine** (QST-AGENT-ENGINE) | **C** — a plain model call per reply, no tools | C | tools (web, code…) considered *after* phase 2 |

- **Access/cost** (QST-ACCESS-COST): **override — no limits in phase 1**; testers are trusted friends. Later the owner can make their agent "stop listening" to a room to stop costs or abuse. If the platform is ever published, revisit this.
- **Hosting** (QST-HOSTING): **B — Render** (server) **+ Neon** (Postgres database), chosen by 3XIA00. This also decides that chat history is stored in Postgres.
- **Web stack** (QST-WEB-STACK): **A — plain Node server (WebSockets) + React client via Vite**, *"since it is the most widely documented way."*
- **Agent connection**: open, QST-AGENT-CONNECTION.

**Rationale**: 3XIA00 kept the *final* shape of each question in view and picked the cheapest version of it for phase 1. That phasing is the main design decision here: every phase-1 choice is the first step of a final choice, not a dead end.

**Trade-offs accepted**: no usage limits in phase 1 (an owner can stop their agent instead). Render instead of a local tunnel means a deploy step from day one, in exchange for the site being always up.

### Consequences
- The database schema should treat humans and agents alike as *participants* in a *room*, even while phase 1 only has 1:1 rooms, so phase 2 needs no schema rewrite.
- ADR-0002's toolchain (npm + tsc + Vitest) covers server and client; Neon adds a Postgres client library (choice deferred to the first DB code).

---

## Open Follow-ups

- [ ] Concern: prompt injection. Anyone in the room can tell the agent "ignore your instructions." With no tools (QST-AGENT-ENGINE C), the worst outcome is the agent saying something off-persona. Revisit this before the agent gets *any* tool.
- [ ] Future task: the "participant" abstraction. Humans and agents should both be participants in a room, so step N's other people's agents slot in ([ADR-0001 QST-AGENT-INTEROP](0001-harness-scope-what-are-we-building.md)).
- [ ] Unverified assumption: Anthropic API key. Confirm 3XIA00 has (or wants) one; it's separate from a Claude.ai subscription. Optional, and it doesn't change the no-limits decision: a monthly spend limit in the Anthropic console is a zero-code backstop against a bug (e.g. a reply loop), not just against strangers.
- [ ] Unverified assumption (from training data, cutoff June 2026; check current terms): Render's free web services sleep after ~15 min idle and take tens of seconds to wake. The first friend after a quiet spell waits, and an open WebSocket may drop. Neon's free Postgres also scales to zero. Both are fine for a toy, but expect a slow first page load.
- [ ] Future task: choose a Postgres client for Neon (`pg`, or a typed layer like Drizzle) when the first DB code is written.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: ADR-0001 Iteration 2, where 3XIA00's answer D named step 1
- Contributors: 3XIA00 (step-1 definition), Saddler 5.5 (questions, options, recommendations)
- Changes: initial draft with six questions
- Outcome: Draft

### Iteration 2 (2026-11-19)
- Trigger: 3XIA00 answered all six questions, framing each as phase 1 → phase 2 → final
- Contributors: 3XIA00 (answers, phasing), Saddler 5.5 (folding in, two new questions)
- Changes: Decision filled as a phase table. Two of my recommendations were not taken: QST-ROOM-SHAPE B became phase 1 A → phase 2 B → final C, and QST-ACCESS-COST A was overridden to no limits. QST-HOSTING moved from my A (PC + tunnel) to B (Render + Neon). New QST-AGENT-CONNECTION reconciles the server-side agent answer with ADR-0001's agents-on-owners'-machines answer and settles webhook vs. listener. New QST-PHASE1-MENTION checks how the @mention rule applies to 1:1 chats.
- Outcome: Draft → Accepted (core decided; two open questions refine phase 1)

---

## Glossary (optional)

- **Room**: a shared chat space with its own link; humans and agents in it are all *participants*.
- **Turn-taking / speak policy**: the rule that decides when an agent replies in a multi-party chat.
- **Tunnel**: a service that gives a program running on your own PC a public URL.
- **Prompt injection**: text written to make an agent ignore its owner's instructions.

---

## Links

- Related ADRs: [ADR-0001 — Harness scope](0001-harness-scope-what-are-we-building.md) (its Decision is this ADR's origin) · [ADR-0002 — Implementation language and runtime](0002-implementation-language-and-runtime.md)
