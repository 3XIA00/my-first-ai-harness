<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# Implementation Language and Runtime

- **Date**: 2026-11-12
- **Iteration**: 3
- **Status**: Accepted
- **Deciders**: 3XIA00; Saddler 5.5 (claude-opus-5-5)

**TL;DR**: TypeScript everywhere (server and browser — the browser runs the compiled JavaScript), Node.js installed in WSL via asdf (nvm as fallback), and npm + tsc + Vitest as the verification gate.

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
- Status: answered
- Why asking: The human leans TypeScript on industry grounds. That holds for agent harnesses (Claude Code, Gemini CLI, and OpenCode are TypeScript; the Claude Agent SDK and MCP SDK both have first-class TypeScript versions). What I don't know: **which language did you write your MCP server in?** Reusing a language you already know lets you put all your attention on harness concepts; switching means learning both at once.
- Need: pick a letter (or override — any shape answers); and if you can, say what language your MCP work was in

Options:
- **A — TypeScript on Node.js**: matches most production agent harnesses; strong typing helps with message/tool-call schemas; first-class Anthropic SDK and MCP SDK. Needs Node installed in WSL (QST-NODE-INSTALL).
- **B — Python**: already installed (3.14); first-class Anthropic SDK, MCP SDK, and Agent SDK; the biggest language in AI generally. Fewer production *harnesses* written in it.
- **C — Rust**: the direction Codex CLI took for speed and a single static binary. Steep learning curve stacked on top of harness concepts — not a first-harness language.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — TypeScript on Node.js.** *Rationale*: For the thing we're building, the human's instinct matches the evidence: the harnesses worth reading as references (Claude Code's public SDK surface, Gemini CLI, OpenCode) are TypeScript, so code we study and code we write would share idioms. TypeScript's type system also earns its keep here: the model's messages, tool-use blocks, and tool-result blocks are tagged unions, and the compiler catching a mishandled block type removes a whole class of loop bugs. **Updated in Iteration 2 (2026-11-12), after ADR-0001 → D:** the project is now a website, and the chat page runs in a browser, which only runs JavaScript. TypeScript gives one language for both halves, and the message types (a chat message, a participant, an agent reply) can be shared between server and client instead of written twice. Python (B) would now mean *two* languages: Python server + JS client. *Confidence*: 0.85 (raised from 0.8) — because the browser constraint removed most of B's appeal, but I'm still missing your MCP language. *If wrong*: if your MCP server was in Python and you'd rather keep the server in Python (FastAPI) while writing only a thin JavaScript page, this flips to **B**. That's workable, but it's two languages to learn the ecosystem of.

**ANS:** (by 3XIA00)
My MCP is not built for this harness project. So dont worry about that. I am still thinking TypeScript because it is used in many mature harnesses. I am not sure if ts works with js. So I am opening up a follow-up question for you.

**Follows up on**: adr:0002#qst-can-we-use-typescript--j

### QST-CAN-WE-USE-TYPESCRIPT--J: Can we use TypeScript + Js client to fit into the website idea?
- Status: answered — 3XIA00 routed it to the agent ("This is a question for agent to answer", 2026-11-19); answered by Saddler 5.5
- Why asking: opened by 3XIA00 as a follow-up to QST-LANGUAGE: does choosing TypeScript fit a website, whose page runs in the browser as JavaScript?
- Need: explanation

Options: none (elicitation)

**ANS:** (by Saddler 5.5, claude-opus-5-5, 2026-11-19)
Yes — and it's simpler than "TypeScript + a JS client": it's **TypeScript on both sides**. TypeScript is JavaScript plus type annotations; a compiler checks the types and then *strips them*, producing plain JavaScript. So:
- **Browser (client)**: we write `.tsx` files (TypeScript + React); Vite compiles them to JavaScript, which is what the browser actually runs. The browser never sees TypeScript.
- **Server**: we write `.ts` files; Node runs the compiled JavaScript (or runs TypeScript directly via a loader during development).
- **Any JavaScript library works** from TypeScript, because TypeScript is a superset — every valid JS file is valid TS. Most popular libraries (React, ws, pg) also ship type definitions.
- **The payoff for this project**: the message format (who sent it, which room, text, timestamp) is written once as a TypeScript type in a shared folder, and both server and client import it. If the server changes the shape of a message, the compiler flags every client line that breaks — before a friend ever sees a bug.

---

### QST-NODE-INSTALL: How do we install Node.js inside WSL?
- Status: answered
- Why asking: Only matters if QST-LANGUAGE is A. WSL currently has no Linux Node; `npm` is the Windows install seen through `/mnt/c`. Running Windows Node from WSL is slow, mixes Windows and Linux path conventions, and is the likely cause of the `adrs4ai` MCP timeout at session start. Installation is the human's hand (it changes the machine, not the repo), so this is your call.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — asdf + `.tool-versions`**: install `asdf`, then the Node LTS plugin; the repo pins its Node version in a committed `.tool-versions` file. The template's `.claude/agent.env` already expects asdf (but has macOS paths that would need a WSL fix).
- **B — nvm (or fnm)**: the most common Node version manager in tutorials; pin via a committed `.nvmrc`. Doesn't match what `agent.env` expects.
- **C — Keep using Windows Node**: no install. Accept the slowness, path quirks, and probable MCP breakage.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — asdf + `.tool-versions`.** *Rationale*: The template is already built around asdf (`CLAUDE.md` Project-Specific Notes; `.claude/agent.env`), so choosing it means fixing one script for WSL instead of maintaining two conventions. asdf also covers Python, so a later Python helper pins the same way. B is equally solid on its own; it loses only on fit with the template. C is ruled out by the MCP timeout we've already hit. *Confidence*: 0.65 — because A vs. B is mostly convention, and if you already use nvm elsewhere, familiarity is worth more than template fit. *If wrong*: if you already have nvm/fnm habits (or asdf won't install cleanly on your WSL), this flips to **B**.

**ANS:** (by 3XIA00)
A. I am not familar with eigher asdf or nvm(I heard if it but never developed with it). So I dont have a clear preference. Since the template is built around asdf, lets use that. If things does not work out later, we would consider switch to nvm(if swiching solved the issue)

---

### QST-TOOLCHAIN-GATE: Which toolchain becomes the verification gate?
- Status: answered
- Why asking: Only matters if QST-LANGUAGE is A. CLAUDE.md's Fifth Directive requires a gate before every commit, but the gate is still a placeholder — and a directive nobody can follow teaches every seat that directives are decorative. Whatever we pick becomes the one command (e.g. `npm run check`) that must be green before any commit.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — npm + tsc + Vitest**: Node LTS, plain npm, `tsc --noEmit` for type-checking, Vitest for tests. Gate: `npm run check` = typecheck + tests. The most conventional setup, with the most documentation and Q&A to lean on.
- **B — Bun**: one binary that runs TypeScript directly, with a built-in test runner and package manager. Fast and few moving parts, but less conventional, and some Node APIs differ slightly.
- **C — pnpm + tsc + Vitest**: same as A with pnpm's faster, stricter installs. Mostly matters in monorepos.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-12)

**A — npm + tsc + Vitest.** *Rationale*: On a learning project, being conventional is a feature: when something breaks, the error message is a search away, and nothing in the toolchain will be mistaken for harness behavior. Vitest runs TypeScript tests without a build step, and `tsc --noEmit` is the check that makes TypeScript worth choosing. B and C buy speed we won't need at this size. *Confidence*: 0.8 — because this is the default stack for a small TypeScript CLI, and nothing in ADR-0001's options needs more. *If wrong*: if we end up wanting a single compiled binary of the harness (to install it like a real CLI), this flips to **B** for `bun build --compile`.

**ANS:** (by 3XIA00)
A. Your explaination makes sense.

---

## Decision

### Chosen
- **Language: TypeScript, server and client** (QST-LANGUAGE A). 3XIA00: *"I am still thinking TypeScript because it is used in many mature harnesses."* The MCP-language concern is moot — 3XIA00's earlier MCP work is unrelated to this project. How TypeScript reaches the browser: QST-CAN-WE-USE-TYPESCRIPT--J.
- **Node.js in WSL via asdf** (QST-NODE-INSTALL A), pinned in a committed `.tool-versions`. 3XIA00 knows neither asdf nor nvm, so template fit decides; **fallback**: switch to nvm if asdf causes trouble *and* switching would fix it.
- **Toolchain: npm + tsc + Vitest** (QST-TOOLCHAIN-GATE A). `npm run check` (typecheck + tests) joins `just gate` once code exists.

**Rationale**: as in each question's Recommendation; all three answers took the recommended option.

### Consequences
- The CLAUDE.md Fifth Directive's gate stays `just gate`; the TypeScript check is added inside it with the first code commit.
- `.claude/agent.env` must be fixed for WSL as part of the asdf install (see Open Follow-ups).
- Windows Node (`/mnt/c/Program Files/nodejs`) stays installed but should no longer be what WSL finds first on `PATH`.

---

## Open Follow-ups

- [ ] Unverified assumption: the `adrs4ai` MCP timeout is caused by Windows `npx` via WSL interop. **Narrowed same day**: `npx -y @adrs4ai/docket list-open docs/adr` *did* run through Windows npx from WSL — so interop isn't outright broken; the likelier mechanism is a slow first-run fetch exceeding the harness's 30 s MCP connect timeout. Retest after Linux Node is installed.
- [x] `.claude/agent.env` prints "✅ ASDF environment initialized" even when asdf is absent, and only searches macOS Homebrew paths. It reports success without checking for it; fix it for WSL whatever QST-NODE-INSTALL decides. **Done 2026-11-19**: it now puts the asdf shims on PATH (all that asdf ≥ 0.16 needs), sources the legacy `asdf.sh` only if it exists, and reports what it actually found. Verified in a clean `env -i` shell with Windows Node first on PATH: it resolved Linux Node 26.13.1. Side effect: kintsugi will now flag this stencil file as locally modified, which is intended.
- [x] **Installed 2026-11-19 (Saddler 5.5)**: asdf v0.20.2 (release binary, md5-verified, at `~/.local/bin/asdf`), the `nodejs` plugin, Node **26.13.1** (current LTS "Lithium", npm 11.20.0), pinned in the committed `.tool-versions`.
- [x] **3XIA00's hand** (done 2026-11-19; verified: a fresh `bash -i` resolves `node` → `~/.asdf/shims/node`, v26.13.1): add asdf's shims to `~/.bashrc` (`export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"`). The agent's attempt to edit the shell profile was refused by the harness's permission layer, correctly: persistent shell configuration is the human's to change. Until this line is added, new terminals still find Windows `npm` first.

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

### Iteration 3 (2026-11-19)
- Trigger: 3XIA00 answered all questions (A, A, A) and opened follow-up QST-CAN-WE-USE-TYPESCRIPT--J, routed to the agent
- Contributors: 3XIA00 (answers), Saddler 5.5 (follow-up answer, Decision)
- Changes: Decision filled. The follow-up's ANS slot held a routing note ("This is a question for agent to answer") rather than an answer, so the routing note moved to the Status annotation and Saddler's answer took the ANS slot, keeping the rule that the ANS text *is* the answer.
- Outcome: Draft → Accepted

---

## Links

- Related ADRs: [ADR-0001 — Harness scope](0001-harness-scope-what-are-we-building.md) · [ADR-0003 — Step 1: a shareable web chat with my agent](0003-step-1-shareable-web-chat-with-my-agent.md)
- Related config: `.mcp.json` (launches the `adrs4ai` server via `npx`), `.claude/agent.env` (asdf bootstrap), `CLAUDE.md` Fifth Directive
