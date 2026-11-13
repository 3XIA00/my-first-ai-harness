<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# Implementation Language and Runtime

- **Date**: 2026-11-12
- **Iteration**: 2
- **Status**: Draft
- **Deciders**: 3XIA00; Saddler 5.5 (claude-opus-5-5)

**TL;DR**: TypeScript — the human's industry lean, now reinforced because the project became a web app (ADR-0001 → D) whose browser half must be JavaScript/TypeScript anyway; Node isn't installed in WSL yet, so this ADR also picks the install route and the verification-gate toolchain.

---

## Originating Context

**Source**: Founding conversation, 2026-11-12 (human ↔ Saddler 5.5, session `7c260c87`). Companion to [ADR-0001 — Harness scope](0001-harness-scope-what-are-we-building.md).

The human, in their words: *"For language, I heard that the industry now uses TypeScript? I think we might just follow what the industry is using."*

Environment as observed by Saddler 5.5 on 2026-11-12 (WSL2, repo on `/mnt/d`):

- `node`, `pnpm`, `bun`, `tsc`: **not installed in WSL**.
- `npm` resolves to `/mnt/c/Program Files/nodejs//npm` — the **Windows** Node install, reached through WSL's PATH interop.
- `python3`: 3.14.4 (Linux).
- `asdf`: **not installed**, although `.claude/agent.env` prints "✅ ASDF environment initialized" anyway (it echoes success unconditionally, and its paths are macOS Homebrew paths).

**Agency Grant**: Recommend; the human decides.

---

## Explicitation

**What I understand**:

1. **"The industry uses TypeScript" is half true, and the true half is the one that matters here.** Among agent harnesses specifically, TypeScript dominates. As of my training data (cutoff June 2026; please verify anything time-sensitive): Claude Code, Gemini CLI, and OpenCode are TypeScript; OpenAI's Codex CLI started in TypeScript and was rewritten in Rust; Aider and OpenHands are Python. The Claude Agent SDK ships in both TypeScript and Python, and the MCP reference SDK is TypeScript. Across *AI work in general* (research, ML, many agent frameworks), Python is still the bigger language.
2. **The missing Linux Node is a real blocker, not a footnote.** It is probably also why the `adrs4ai` MCP server timed out at session start: `.mcp.json` launches it with `npx`, which in WSL currently means Windows `npx` crossing the `/mnt/c` boundary. *Unverified hypothesis* — it should be retested after Linux Node is installed.
3. **This choice also fills the CLAUDE.md Fifth Directive's placeholder** (`⟦VERIFICATION-GATE⟧`): the toolchain picked here becomes the command every commit must pass.

**Assumptions**:

- ~~ADR-0001 lands on building an agent harness (A or C on QST-HARNESS-MEANING).~~ **Iteration 2:** ADR-0001 landed on **D, a multi-agent chat website**, so the project now has a browser client (which must be JavaScript/TypeScript) and a Node server that runs the agents. Web stack choices live in [ADR-0003 QST-WEB-STACK](0003-step-1-shareable-web-chat-with-my-agent.md).
- The human's MCP experience might be in Python or TypeScript; I don't know which (asked inside QST-LANGUAGE).

**Confirm**: the project human.

---

## Questions

### QST-LANGUAGE: Which language do we build the harness in?
- Status: unanswered
- Why asking: The human leans TypeScript on industry grounds. That holds for agent harnesses (Claude Code, Gemini CLI, and OpenCode are TypeScript; the Claude Agent SDK and MCP SDK both have first-class TypeScript versions). What I don't know: **which language did you write your MCP server in?** Reusing a language you already know lets you put all your attention on harness concepts; switching means learning both at once.
- Need: pick a letter (or override — any shape answers); and if you can, say what language your MCP work was in

Options:
- **A — TypeScript on Node.js**: matches most production agent harnesses; strong typing helps with message/tool-call schemas; first-class Anthropic SDK and MCP SDK. Needs Node installed in WSL (QST-NODE-INSTALL).
- **B — Python**: already installed (3.14); first-class Anthropic SDK, MCP SDK, and Agent SDK; the biggest language in AI generally. Fewer production *harnesses* written in it.
- **C — Rust**: the direction Codex CLI took for speed and a single static binary. Steep learning curve stacked on top of harness concepts — not a first-harness language.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — TypeScript on Node.js.** *Rationale*: For the thing we're building, the human's instinct matches the evidence: the harnesses worth reading as references (Claude Code's public SDK surface, Gemini CLI, OpenCode) are TypeScript, so code we study and code we write would share idioms. TypeScript's type system also earns its keep here: the model's messages, tool-use blocks, and tool-result blocks are tagged unions, and the compiler catching a mishandled block type removes a whole class of loop bugs. **Updated in Iteration 2 (2026-11-12), after ADR-0001 → D:** the project is now a website, and the chat page runs in a browser, which only runs JavaScript. TypeScript gives one language for both halves, and the message types (a chat message, a participant, an agent reply) can be shared between server and client instead of written twice. Python (B) would now mean *two* languages: Python server + JS client. *Confidence*: 0.85 (raised from 0.8) — because the browser constraint removed most of B's appeal, but I'm still missing your MCP language. *If wrong*: if your MCP server was in Python and you'd rather keep the server in Python (FastAPI) while writing only a thin JavaScript page, this flips to **B**. That's workable, but it's two languages to learn the ecosystem of.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-NODE-INSTALL: How do we install Node.js inside WSL?
- Status: unanswered
- Why asking: Only matters if QST-LANGUAGE is A. WSL currently has no Linux Node; `npm` is the Windows install seen through `/mnt/c`. Running Windows Node from WSL is slow, mixes Windows and Linux path conventions, and is the likely cause of the `adrs4ai` MCP timeout at session start. Installation is the human's hand (it changes the machine, not the repo), so this is your call.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — asdf + `.tool-versions`**: install `asdf`, then the Node LTS plugin; the repo pins its Node version in a committed `.tool-versions` file. The template's `.claude/agent.env` already expects asdf (but has macOS paths that would need a WSL fix).
- **B — nvm (or fnm)**: the most common Node version manager in tutorials; pin via a committed `.nvmrc`. Doesn't match what `agent.env` expects.
- **C — Keep using Windows Node**: no install. Accept the slowness, path quirks, and probable MCP breakage.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — asdf + `.tool-versions`.** *Rationale*: The template is already built around asdf (`CLAUDE.md` Project-Specific Notes; `.claude/agent.env`), so choosing it means fixing one script for WSL instead of maintaining two conventions. asdf also covers Python, so a later Python helper pins the same way. B is equally solid on its own; it loses only on fit with the template. C is ruled out by the MCP timeout we've already hit. *Confidence*: 0.65 — because A vs. B is mostly convention, and if you already use nvm elsewhere, familiarity is worth more than template fit. *If wrong*: if you already have nvm/fnm habits (or asdf won't install cleanly on your WSL), this flips to **B**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-TOOLCHAIN-GATE: Which toolchain becomes the verification gate?
- Status: unanswered
- Why asking: Only matters if QST-LANGUAGE is A. CLAUDE.md's Fifth Directive requires a gate before every commit, but the gate is still a placeholder — and a directive nobody can follow teaches every seat that directives are decorative. Whatever we pick becomes the one command (e.g. `npm run check`) that must be green before any commit.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — npm + tsc + Vitest**: Node LTS, plain npm, `tsc --noEmit` for type-checking, Vitest for tests. Gate: `npm run check` = typecheck + tests. The most conventional setup, with the most documentation and Q&A to lean on.
- **B — Bun**: one binary that runs TypeScript directly, with a built-in test runner and package manager. Fast and few moving parts, but less conventional, and some Node APIs differ slightly.
- **C — pnpm + tsc + Vitest**: same as A with pnpm's faster, stricter installs. Mostly matters in monorepos.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — npm + tsc + Vitest.** *Rationale*: On a learning project, being conventional is a feature: when something breaks, the error message is a search away, and nothing in the toolchain will be mistaken for harness behavior. Vitest runs TypeScript tests without a build step, and `tsc --noEmit` is the check that makes TypeScript worth choosing. B and C buy speed we won't need at this size. *Confidence*: 0.8 — because this is the default stack for a small TypeScript CLI, and nothing in ADR-0001's options needs more. *If wrong*: if we end up wanting a single compiled binary of the harness (to install it like a real CLI), this flips to **B** for `bun build --compile`.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

Pending the questions above. When answered, Iteration 2 records the choice here and fills the CLAUDE.md Fifth Directive's `⟦VERIFICATION-GATE⟧` / `⟦GATE-WHY⟧` placeholders.

---

## Open Follow-ups

- [ ] Unverified assumption: the `adrs4ai` MCP timeout is caused by Windows `npx` via WSL interop. **Narrowed same day**: `npx -y @adrs4ai/docket list-open docs/adr` *did* run through Windows npx from WSL — so interop isn't outright broken; the likelier mechanism is a slow first-run fetch exceeding the harness's 30 s MCP connect timeout. Retest after Linux Node is installed.
- [ ] `.claude/agent.env` prints "✅ ASDF environment initialized" even when asdf is absent, and only searches macOS Homebrew paths. It reports success without checking for it; fix it for WSL whatever QST-NODE-INSTALL decides.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: human leaned toward TypeScript in the founding conversation; Saddler observed that WSL has no Linux Node
- Contributors: project human (originating words), Saddler 5.5 (environment survey, options, recommendations)
- Changes: initial draft — three questions (language, Node install, verification-gate toolchain)
- Outcome: Draft

### Iteration 2 (2026-11-12)
- Trigger: ADR-0001 Iteration 2. The project became a multi-agent chat website (answer D).
- Contributors: Saddler 5.5
- Changes: assumption about ADR-0001's outcome replaced; QST-LANGUAGE recommendation strengthened (browser constraint, shared types), confidence 0.8 → 0.85, falsifier rewritten for the web context; framework choice delegated to ADR-0003 QST-WEB-STACK. QST-NODE-INSTALL and QST-TOOLCHAIN-GATE unchanged; npm + tsc + Vitest works for both a Node server and a Vite/React client.
- Outcome: stays Draft (all three questions still open)

---

## Links

- Related ADRs: [ADR-0001 — Harness scope](0001-harness-scope-what-are-we-building.md) · [ADR-0003 — Step 1: a shareable web chat with my agent](0003-step-1-shareable-web-chat-with-my-agent.md)
- Related config: `.mcp.json` (launches the `adrs4ai` server via `npx`), `.claude/agent.env` (asdf bootstrap), `CLAUDE.md` Fifth Directive
