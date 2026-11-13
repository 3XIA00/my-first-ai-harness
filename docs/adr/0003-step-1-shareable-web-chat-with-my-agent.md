<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# Step 1 — A Shareable Web Chat with My Agent

- **Date**: 2026-11-12
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: 3XIA00; Saddler 5.5 (claude-opus-5-5)

**TL;DR**: Six design questions for step 1, the website 3XIA00 shares by link so friends can chat with 3XIA00's agent: room shape, when the agent speaks, what runs the agent, access/cost, hosting, and web stack.

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
- Status: unanswered
- Why asking: Your step-1 sentence works both ways: "friends can chat with my agent" might mean each friend has their own private conversation, or everyone is in one room together with the agent. The end goal (agents from different people chatting in a room) is a shared room.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Private 1:1**: each friend who opens the link gets their own conversation with your agent; friends don't see each other. Simplest — just a chatbot website.
- **B — One shared room**: everyone with the link is in the same room; all humans and the agent see every message, like a group chat with a bot in it.
- **C — Rooms by link**: you can create several rooms, each with its own link; each room is a shared group chat (B), and a room with one friend in it behaves like A.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**B — One shared room.** *Rationale*: The destination in ADR-0001's Decision is a multi-party room, and B is that destination's smallest version: one room, many humans, one agent. A would teach us a chatbot and then need rebuilding into rooms. B also forces the most interesting harness problem early, turn-taking (QST-SPEAK-POLICY). C is B plus room management, which we can add once B works. *Confidence*: 0.65 — because B matches the end goal, but you may have pictured private chats when you wrote step 1. *If wrong*: if you want friends' conversations with your agent to be private from each other, this flips to **A**. If you already want separate rooms for separate friend groups, it flips to **C**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-SPEAK-POLICY: In a shared room, when does the agent reply?
- Status: unanswered
- Why asking: Only matters if QST-ROOM-SHAPE is B or C. In a 1:1 chat the agent answers every message. In a group, "answer everything" makes the agent interrupt humans talking to each other, and every message costs a model call. Single-user harnesses never face this problem; every multi-agent room does. When step N puts two agents in one room, a bad policy here means they reply to each other forever.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Only when @mentioned**: the agent replies only when someone writes `@agentname`. Predictable and cheap; one model call per mention.
- **B — Every message**: the agent replies to every human message. Lively, but noisy and the most expensive.
- **C — Agent decides**: on every message, a cheap model call asks "should I speak?" and the agent replies only if yes. The most natural-feeling, but it pays for a model call on every message, and it's the hardest to make predictable.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Only when @mentioned.** *Rationale*: A is the only option whose cost and behavior you can predict before launch: one model call per mention, and friends always know why the agent spoke. It's also the policy that survives step N, because two agents that only answer mentions can't loop unless they mention each other, and that's one rule to cap. C is the interesting research problem and makes a good later iteration once we have real chat logs to judge it against. *Confidence*: 0.7 — because predictability and cost both point the same way, though A may feel stiff in a lively room. *If wrong*: if real use shows friends forgetting to @mention and the room feeling dead, this flips to **C**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-AGENT-ENGINE: What runs "my agent" on the server?
- Status: unanswered
- Why asking: Successor to [ADR-0001 QST-BUILD-DEPTH](0001-harness-scope-what-are-we-building.md), re-asked for a public web context. The agent needs at least: a system prompt (its personality), the room's recent messages as context, and a call to the model. The question is how much of that loop we write and what tools the agent gets.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Our own loop on the raw model API**: we call Claude's Messages API ourselves. We write the context-building (which messages, how many, who said what), the reply, and any tool-use loop. Tools: none at first, then only safe, server-side ones (e.g. a dice roll, a web lookup) that never touch the host machine.
- **B — Claude Agent SDK**: the engine under Claude Code. Runs the loop for us, but it's built around file, shell, and code tools on a machine. Those are the wrong defaults for an agent that strangers can talk to; we'd spend effort switching them off.
- **C — No loop yet, plain completion**: one model call per reply with the system prompt and recent messages; no tools at all. The smallest possible step 1; tools come later as a deliberate upgrade to A.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**C — No loop yet, plain completion, growing into A.** *Rationale*: Step 1's job is "friends can chat with my agent." A single model call with a good system prompt does that, and it means the first deploy has zero tool surface for strangers to abuse. The harness-building lesson isn't lost, it's sequenced: once the chat works, adding a tool-use loop is a small, self-contained iteration where the loop is the *only* new thing, which makes it easier to learn. B is ruled out by the public-link threat model (Explicitation 3). *Confidence*: 0.7 — because C is clearly the safer first deploy, but you may want tools in the very first version. *If wrong*: if the agent you picture *needs* abilities from day one (looking things up, remembering friends, playing games), this flips to **A** with a vetted tool list.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-ACCESS-COST: How do we stop the link from costing you money or being abused?
- Status: unanswered
- Why asking: Every agent reply is billed to *your* API key. Links get forwarded; a link that reaches a stranger, a bot, or a friend's prank script can run up a real bill or fill the room with junk. This is the one part of a toy project that can do real damage, so I'd like an explicit decision rather than a default.
- Need: pick a letter (or override — any shape answers); all options assume you also set a **monthly spend limit on the API key in the Anthropic console** (a provider-side hard cap, independent of our code)

Options:
- **A — Secret link + server caps**: the room URL contains a long unguessable token (`/r/k3x9…`); the server enforces per-room limits (e.g. N agent replies per hour, max message length). No accounts. A forwarded link still works, but the caps bound the damage.
- **B — Shared passcode**: the link opens a page asking for a nickname + a passcode you tell friends separately; plus A's server caps. A forwarded link alone isn't enough to get in.
- **C — Real accounts**: sign in with Google/GitHub; you approve who gets in. Strongest control, but most of a week's work, and every friend needs an account.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Secret link + server caps (plus the console spend limit).** *Rationale*: For a handful of friends, the realistic risk is a forwarded link, not a targeted attack. Three layers cover that: the console limit caps the worst-case bill no matter what our code does, the per-room reply cap bounds the damage rate, and the token keeps the room out of search engines and URL guessing. B adds a small barrier for little extra work, and it's an easy upgrade if a link leaks. C is real product work that teaches auth, not harnesses. *Confidence*: 0.75 — because A + console limit bounds the money risk for this audience size, and that risk is the one that matters. *If wrong*: if the link will be posted anywhere semi-public (a class Discord, social media), this flips to **B**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-HOSTING: Where does the site run so friends can open the link?
- Status: unanswered
- Why asking: "Share a link" means the server must be reachable from the internet. Chat needs a long-lived connection (WebSocket or server-sent events) so messages appear live, which rules some hosting styles in or out.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Your PC + a tunnel**: run the server on your machine and expose it with a tunnel (e.g. Cloudflare Tunnel or ngrok), which gives you a public URL. Free, instant, and every code change is live immediately — but the room is only up while your PC is on.
- **B — A container host**: deploy to a platform that runs a long-lived Node server (e.g. Render, Fly.io, Railway). Always on; small free/cheap tiers exist; adds a deploy step and a place to keep the API key as a secret.
- **C — Serverless (e.g. Vercel)**: great for websites, but serverless functions are short-lived, so live chat needs a third-party realtime service bolted on. More moving parts for a chat app.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Your PC + a tunnel, moving to B when friends want it always on.** *Rationale*: During step 1 we'll change the code many times a day; with a tunnel, every change is live for friends instantly with no deploy pipeline to build or debug. Moving to B later is a deploy step, not a rewrite, *if* we keep the server a plain long-lived Node process (which QST-WEB-STACK's recommendation does). C fits chat apps badly, for the connection-lifetime reason in the Why line. *Confidence*: 0.65 — because A is fastest for iteration, but "the room is down when my laptop sleeps" may annoy friends sooner than I expect. *If wrong*: if you want friends to drop in any time from the first day, this flips to **B**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-WEB-STACK: What do we build the website with?
- Status: unanswered
- Why asking: Assumes TypeScript ([ADR-0002 QST-LANGUAGE](0002-implementation-language-and-runtime.md)). The site has two halves: a **server** (holds rooms, talks to the model, pushes messages live) and a **client** (the chat page in the browser). The stack decides how visible the harness logic stays and how hosting works.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Plain Node server + small React client**: one Node process (e.g. Fastify or Express) with WebSockets for live messages, serving a React chat page built with Vite. Every piece of the room/agent logic is our own code in one place. Runs anywhere a Node process runs (tunnel or container host).
- **B — Next.js full-stack**: one framework for pages and API routes, the most popular React setup. But its server side leans serverless, and live chat over WebSockets needs workarounds or an external realtime service.
- **C — Plain Node server + plain HTML/JS client**: as A, but the chat page is hand-written HTML + a little JavaScript, no React. Fewest tools; gets clumsy as the UI grows.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — Plain Node server + small React client.** *Rationale*: The harness is the server, so we want the server to be ours: a plain Node process where the room → model → reply path is code we can read top to bottom, not framework conventions. It's also the shape QST-HOSTING's A and B both need (a long-lived process). React + Vite for the page is the most widely documented way to build a chat UI, and it grows when step N adds multiple agents and rooms. B is the industry default for websites, but it fits a realtime chat server poorly. C is fine for a day, cramped by week two. *Confidence*: 0.7 — because A fits the realtime and hosting constraints, but you may already know Next.js, and familiarity counts. *If wrong*: if you're already comfortable in Next.js and would rather add a realtime service than learn a new server setup, this flips to **B**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

Pending the questions above.

---

## Open Follow-ups

- [ ] Concern: prompt injection. Anyone in the room can tell the agent "ignore your instructions." With no tools (QST-AGENT-ENGINE C), the worst outcome is the agent saying something off-persona. Revisit this before the agent gets *any* tool.
- [ ] Future task: the "participant" abstraction. Humans and agents should both be participants in a room, so step N's other people's agents slot in ([ADR-0001 QST-AGENT-INTEROP](0001-harness-scope-what-are-we-building.md)).
- [ ] Unverified assumption: Anthropic API key + console spend limit. Confirm that 3XIA00 has (or wants) an API key, which is separate from a Claude.ai subscription.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: ADR-0001 Iteration 2, where 3XIA00's answer D named step 1
- Contributors: 3XIA00 (step-1 definition), Saddler 5.5 (questions, options, recommendations)
- Changes: initial draft with six questions
- Outcome: Draft

---

## Glossary (optional)

- **Room**: a shared chat space with its own link; humans and agents in it are all *participants*.
- **Turn-taking / speak policy**: the rule that decides when an agent replies in a multi-party chat.
- **Tunnel**: a service that gives a program running on your own PC a public URL.
- **Prompt injection**: text written to make an agent ignore its owner's instructions.

---

## Links

- Related ADRs: [ADR-0001 — Harness scope](0001-harness-scope-what-are-we-building.md) (its Decision is this ADR's origin) · [ADR-0002 — Implementation language and runtime](0002-implementation-language-and-runtime.md)
