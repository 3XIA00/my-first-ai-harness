<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# Harness Scope — What Are We Building?

- **Date**: 2026-11-12
- **Iteration**: 2
- **Status**: Accepted
- **Deciders**: 3XIA00; Saddler 5.5 (claude-opus-5-5)

**TL;DR**: We're building a toy online platform where different people's agents chat together in a room; step 1 is a website 3XIA00 can share by link so friends can chat with 3XIA00's agent (designed in ADR-0003).

---

## Originating Context

**Source**: Founding conversation, 2026-11-12 (human ↔ Saddler 5.5, session `7c260c87`). Founding brief: [`docs/inbox/2026-11-12-2332-founding-brief-interactive.md`](../inbox/2026-11-12-2332-founding-brief-interactive.md).

The human, in their words: *"I am learning how to build an ai harness. I have built MCP before but this is my first time with building harness (I have used and learnt harness before). In this project, we will discuss and build a harness. There is no limitations, we are co-workers. I haven't changed any code yet, I just created this repo from professor's template."* And later: *"I don't have a clear picture of scope right now. Please open an ADR for that."*

**Agency Grant**: Explore options and recommend; the human decides scope.

---

## Explicitation

**What I understand**:

1. **Learning is a first-class goal**, not a side effect — so a choice that hides the interesting machinery (because a library already does it) is worth less here than it would be in a product repo.
2. **The human already knows the MCP side** (tools exposed *to* a harness). The new territory is the other side of that wire: the program that drives the model, decides which tool calls run, asks permission, and manages context.
3. **The repo is a professor's template** (ADRs4AI human-AI collaboration template) — it already ships a *collaboration* harness (ADRs, inbox, crew registry, `pneumatic` seat launcher) around Claude Code.

**Assumptions**:

- "Harness" means an **agent harness** — the runtime loop around an LLM (what Claude Code, Codex CLI, Gemini CLI are). *This is the assumption I trust least* — see QST-HARNESS-MEANING.
- There is no hard deadline or rubric that constrains scope; the human said "no limitations." If a course assignment exists, it overrides my guesses (QST-COURSE-CONSTRAINTS).
- Implementation language is handled separately in [ADR-0002](0002-implementation-language-and-runtime.md).

**Confirm**: the project human.

---

## Questions

### QST-HARNESS-MEANING: Which "harness" are we building?
- Status: answered — override D (multi-agent chat platform); recorded in Decision below
- Why asking: "Harness" has two live meanings in this repo, and they lead to completely different projects. (1) An **agent harness**: the program that runs the model ↔ tool loop — what Claude Code itself is. (2) A **collaboration harness**: the scaffolding *around* agents and humans — this template's ADRs, inbox briefs, crew registry, and seat launcher. The repo name `my-first-ai-harness` plus a professor's collaboration template could point at either. Everything else in this ADR depends on which one.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Agent harness**: build the runtime that drives an LLM: send messages, receive tool calls, execute them under a permission policy, feed results back, manage the context window. The template's ADR/inbox machinery is how *we* work, not what we build.
- **B — Collaboration harness**: build or extend the coordination layer — e.g. new crew tooling, inbox automation, multi-seat orchestration, hooks — on top of an existing agent harness (Claude Code). The agent loop stays someone else's.
- **C — Both, agent first**: build a small agent harness, then grow collaboration features into it (multiple agents, briefs, persistent identity) — the template becomes a spec for features our harness eventually supports natively.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**C — Both, agent first.** *Rationale*: The human named MCP as prior experience, and the MCP server is exactly the half of an agent harness they *haven't* had to write the other side of — A/C teach the missing half. C keeps A's learning path but gives the project a direction once the loop works: this repo already documents a mature collaboration layer (`docs/inbox/ONBOARDING.md` §3–4, `agent-sessions.json`), so we would be re-deriving its ideas from inside a harness we understand instead of only using them. *Confidence*: 0.6 — because I'm inferring the course's intent from a repo name and template choice, not from an assignment text. *If wrong*: if the professor's assignment defines "harness" as the collaboration methodology (or asks students to extend `pneumatic`/the crew layer), this flips to **B**.

**ANS:** (by 3XIA00, 2026-11-12)
I would say my choice is D: This is a toy project. Claude and ADR are tools to help me build my own harness. I am thinking if we can build a online platform so that agent from different people can chat in that website/room. Right now, for step 1, we can build a website so that I can share a link with my friends and they can chat we my agent.

---

### QST-BUILD-DEPTH: How much of the agent loop do we write ourselves?
- Status: superseded — by ADR-0003 QST-AGENT-ENGINE (same question, re-asked for a server-side agent in a web chat)
- Why asking: Only matters if the answer to QST-HARNESS-MEANING is A or C. An agent harness has roughly six parts: (1) the **loop** (call model → get tool calls → run them → send results back → repeat until done), (2) a **tool registry** + dispatch, (3) a **permission policy** (what runs automatically vs. asks the human), (4) **context management** (system prompt, truncation/compaction, token budgeting), (5) **session persistence** (transcripts, resume), (6) **extension points** (MCP client, hooks, skills, subagents). The question is which of these we write by hand vs. take from a library.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — From the raw API**: use only the model provider's plain messages SDK (send messages, get back text + tool-use blocks). We write all six parts. Most learning, most code; a usable minimum is a few hundred lines.
- **B — On an agent SDK**: use a framework that already runs the loop (e.g. the Claude Agent SDK, which is the engine under Claude Code). We write tools, permission policy, hooks, and UI on top. Faster to something capable, but parts 1, 4, and 5 are mostly done for us — and those are the parts that are hardest to see from the outside.
- **C — Raw first, SDK later**: build A's minimal loop to understand it, then compare against B (or migrate) once we can tell what the SDK is doing for us.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — From the raw API.** *Rationale*: The stated goal is *learning how to build* a harness; B hands us the loop, context management, and persistence — the three parts that are invisible when you only use a harness (which the human already has). The minimal raw loop is small enough to finish quickly, so A doesn't block progress the way it would for a product. I'm picking A over C because C's "compare later" step happens naturally whenever we hit a hard part (compaction, streaming) — it doesn't need to be scheduled up front. *Confidence*: 0.75 — because the learning goal is explicit in the human's words, but I don't know their time budget. *If wrong*: if there's a deadline that needs a capable harness (file editing, MCP, subagents) within a couple of weeks, this flips to **B**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-FIRST-MILESTONE: What is the first thing that should work end-to-end?
- Status: superseded — by QST-HARNESS-MEANING's answer, which names step 1 (a shareable web chat with 3XIA00's agent); its design questions live in ADR-0003
- Why asking: A "walking skeleton" — the thinnest version that touches every layer — keeps us honest about integration early. Assumes A or C on QST-HARNESS-MEANING; if B, this question is superseded by a collaboration-layer equivalent.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Chat REPL, one read-only tool**: a terminal loop where you type, the model answers, and it can call `read_file`. No permissions needed (read-only). Proves: API call, tool-use round trip, multi-turn history.
- **B — REPL + shell tool + approval prompt**: as A, plus a `bash` tool that asks "run this? [y/N]" before executing. Proves everything in A plus the permission layer — the part that makes a harness safe to point at a real machine.
- **C — MCP client first**: the loop connects to an MCP server (e.g. one the human already built) and exposes its tools to the model. Builds on known ground and proves tool discovery is pluggable.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**B — REPL + shell tool + approval prompt.** *Rationale*: A is too thin to teach the defining harness problem — deciding what the model is *allowed* to do — while B adds exactly that at the cost of one more tool and a y/N prompt. C is attractive (the human's MCP server becomes our first test tool) but makes our first milestone depend on a protocol layer before the core loop is understood; it's a strong *second* milestone. *Confidence*: 0.7 — because B is the conventional skeleton for coding-agent harnesses, but the human's MCP background could make C the more motivating start. *If wrong*: if the human has an MCP server they're excited to drive, this flips to **C**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-COURSE-CONSTRAINTS: Is there an assignment text, rubric, or deadline for this project?
- Status: unanswered — "this is a toy project" (QST-HARNESS-MEANING) suggests none; a one-word confirmation closes it
- Why asking: This repo came from a professor's template for CIS MSE 7000. If the course has a written assignment, its definition of "harness," required deliverables, and due dates outrank every recommendation in this ADR — I'd rather read it than guess. "No limitations" may fully answer this; I'm asking once so the assumption is recorded rather than implied.
- Need: explanation — paste or link the assignment text, or say "none beyond what I said"

Options: none (elicitation)

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

Elicitation — no pick. If there is an assignment document, dropping it into `docs/` (or pasting it in chat) lets me re-check every recommendation above against it.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

### Context
"Build a harness" had at least two meanings (agent runtime vs. collaboration layer). 3XIA00 picked neither: the ADR/Claude machinery is the *workshop*, not the product.

### Chosen: D — a multi-agent chat platform (toy project)
An online platform where agents belonging to different people chat together in a website "room." **Step 1**: a website 3XIA00 can share by link, where friends chat with 3XIA00's agent.

**Rationale** (3XIA00's words): *"This is a toy project. Claude and ADR are tools to help me build my own harness. I am thinking if we can build a online platform so that agent from different people can chat in that website/room."*

**Why it's still a harness** (Saddler 5.5's reading — catch me if this is wrong): the server that runs the room *is* an agent harness. It calls the model, decides when an agent speaks, executes (or refuses) its tool calls, and manages its context — but for many humans and eventually many agents at once, not one developer in a terminal. Everything that QST-BUILD-DEPTH covered still exists here, plus two problems a single-user harness never faces: **turn-taking** (when should an agent speak in a group?) and **untrusted input** (anyone with the link can talk to the agent and try to steer it).

**Trade-offs accepted**: a public-facing web app brings deployment, access control, and API cost from day one — work that a local CLI harness would have postponed.

### Consequences
- Step 1's design questions (chat shape, agent engine, access/cost, hosting, web stack, turn-taking) → [ADR-0003](0003-step-1-shareable-web-chat-with-my-agent.md).
- [ADR-0002](0002-implementation-language-and-runtime.md)'s TypeScript lean gets stronger: the browser half must be JavaScript/TypeScript regardless.
- The long-term multi-agent question (how *other people's* agents join) is parked below — step 1 doesn't need it answered.

---

## Open Follow-ups

### QST-AGENT-INTEROP: How do agents belonging to other people join a room?
- Status: deferred — not needed until step 1 ships; revisit when the first friend wants to bring their own agent
- Why deferring: The end goal is a room where agents from different people talk to each other. That raises questions step 1 doesn't: does each person's agent run on *our* server (they give us a system prompt + API key), on *their* machine (connecting in over some protocol — e.g. MCP, or an agent-to-agent protocol like Google's A2A), or both? Who pays for each agent's tokens? How does the room stop two agents from replying to each other forever? Recording these now so step 1's design doesn't accidentally close any of these doors.

**ANS:** [Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: human asked to open a scope ADR during the founding conversation
- Contributors: project human (originating words), Saddler 5.5 (draft, options, recommendations)
- Changes: initial draft — four questions (harness meaning, build depth, first milestone, course constraints)
- Outcome: Draft

### Iteration 2 (2026-11-12)
- Trigger: 3XIA00 answered QST-HARNESS-MEANING with an override, D, which changed the project's direction
- Contributors: 3XIA00 (answer), Saddler 5.5 (folding the answer in)
- Changes: Decision filled (D, multi-agent chat platform; step 1 = shareable web chat); QST-BUILD-DEPTH and QST-FIRST-MILESTONE superseded (successors in ADR-0003); QST-AGENT-INTEROP parked as deferred; QST-COURSE-CONSTRAINTS left open for a one-word confirmation. The ANS byline was written as the unfilled `⟦HUMAN-NAME⟧` sigil (the ADR Manager extension evidently hadn't reloaded the new `adrManager.humanName` setting) and was corrected to 3XIA00; the answer text is unchanged. My Iteration-1 recommendation (C, agent harness first) was not taken. I'm noting it here rather than deleting it.
- Outcome: Draft → Accepted

---

## Glossary (optional)

- **Agent harness**: the runtime around an LLM that executes its tool calls and manages the conversation — e.g. Claude Code.
- **Collaboration harness**: the process and coordination scaffolding around agents and humans — e.g. this template's ADRs, inbox, and crew registry.
- **Walking skeleton**: the thinnest end-to-end version of a system that exercises every layer, built first and fleshed out after.

---

## Links

- Related ADRs: [ADR-0002 — Implementation language and runtime](0002-implementation-language-and-runtime.md) · [ADR-0003 — Step 1: a shareable web chat with my agent](0003-step-1-shareable-web-chat-with-my-agent.md)
- Founding brief: [`docs/inbox/2026-11-12-2332-founding-brief-interactive.md`](../inbox/2026-11-12-2332-founding-brief-interactive.md)
