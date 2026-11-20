<!-- adr template version: "adr-madr 3.12.0" -->
<!-- kept in deliberate homage to MADR — Markdown Architectural Decision Records, the lineage this template family descends from. This is the simple-decisions form: use it when a decision needs recording, not discussion. The deliberation-native form is adr.md. Mint with `just adr "<title>" madr`. (Ruling: QST-MADR-FATE, 2026-08-13 — "keeping the template, acknowledging it, is good form.") -->

# M4 — Deploy: Page on GitHub Pages, Server on Render's Free Tier

* Status: accepted
* Deciders: Saddler 5.5 (claude-opus-5-5), implementing 3XIA00's hosting decision (ADR-0003 QST-HOSTING-COST = E); 3XIA00 may override any line
* Date: 2026-11-19

**TL;DR**: The chat page is built with the server's address baked in and published to GitHub Pages by a GitHub Actions workflow, using hash links (`…/#/r/<id>`). The room server runs on Render's free tier with plain `node` (Node's built-in TypeScript support, no `tsx`), reads Render's `PORT`, and only accepts browser requests from allowed origins. The agent pings the server so it doesn't fall asleep while the agent is online.

Technical Story: ADR-0003 Action Items, milestone **M4**, revised for QST-HOSTING-COST = E. 3XIA00: *"I just want to have something to share."*

## Context and Problem Statement

Until now everything ran on `localhost`, with Vite forwarding `/api` and `/ws` to the server on the same origin. On Pages + Render, the page (`https://3xia00.github.io/my-first-ai-harness/`) and the server (`https://<name>.onrender.com`) live on **different origins**, and Pages serves static files only, under a sub-path. Render's free tier also sleeps after 15 idle minutes and takes about a minute to wake (render.com/docs/free, checked 2026-11-19).

## Decision Drivers

* $0 and shareable with the class (the professor's advice, ADR-0003 QST-HOSTING-COST).
* No architecture change: the server, MCP endpoint, and agent stay as built in M1–M3.
* Don't let the free tier's cold start look like a broken site.
* Keep secrets off GitHub. The repo becomes public (free Pages requires it).

## Decision Outcome

**Page (GitHub Pages)**
* **Hash routes**: room links become `…/#/r/<id>`. Pages has no fallback for unknown paths, so `/r/<id>` would 404 on a fresh load; everything after `#` stays in the browser.
* **Server address at build time**: `VITE_SERVER_URL` (empty in development, where the Vite proxy keeps the same origin). The WebSocket URL is derived from it (`https` → `wss`).
* **Sub-path**: built with `VITE_BASE=/my-first-ai-harness/`.
* **Workflow** `.github/workflows/pages.yml`: on every push to `main`, `npm ci` → `npm run build` → publish `dist/client`. Actions pinned to current majors, checked 2026-11-19: checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5. The server address comes from a repository **variable** `SERVER_URL`, not a secret, because it ends up in the public page anyway.
* **Cold start UX**: the home page pings `/api/health` on load so the server starts waking immediately. If creating or joining a room takes more than a few seconds, the page says "Waking up the server (free hosting), this can take up to a minute…" instead of looking stuck.

**Server (Render free tier)**
* **Runs with plain `node src/server/index.ts`** (`npm start`). Node 26 strips TypeScript types natively, and the code already avoids TypeScript-only runtime syntax. This **pays off TD-2** (no `tsx` in production), and `tsx` can stay a dev dependency.
* **Port**: Render's `PORT`, falling back to `SERVER_PORT`, then 3001.
* **Allowed origins**: `ALLOWED_ORIGINS` (comma-separated, default `http://localhost:5173`). HTTP responses carry `Access-Control-Allow-Origin` only for those. **WebSocket connections from a browser on any other origin are refused** (browsers don't apply CORS to WebSockets, so the server must check `Origin` itself). Non-browser clients (no `Origin` header: the agent, tests, the Inspector) are unaffected; they're governed by the agent token on `/mcp`.
* **Settings on Render** (never in the repo): `DATABASE_URL` (Neon **main** branch), `AGENT_TOKEN`, `AGENT_NAME`, `ALLOWED_ORIGINS=https://3xia00.github.io`. Node version from a committed `.node-version` (26.13.1).

**Agent (3XIA00's PC)**
* `ROOM_SERVER_URL=https://<name>.onrender.com` in `.env`.
* **Keep-alive**: the harness sends an MCP `ping` every 10 minutes. Render's spin-down timer counts *incoming* traffic, so while the agent is online the server stays awake and friends get an instant page. One always-on service is about 744 hours a month, within the 750 free hours. When the agent is off, the server sleeps as usual.

### Positive Consequences

* $0; page always loads instantly from Pages; no architecture change.
* TD-2 resolved (no `tsx` in production).

### Negative Consequences

* While the agent is offline, the first visitor waits up to a minute for the server to wake.
* Render may restart a free service at any time. Open chats then show "Disconnected" until reload, and the agent reconnects by itself (ADR-0006 design step 7).
* The page's server address is fixed at build time: changing Render service names means updating the `SERVER_URL` variable and re-running the workflow.

## Open question

### QST-HISTORY-NAME: Scrub a real name from git history before the first public push?
- Status: unanswered
- Why asking: the repo becomes public for Pages, and that includes all git history. One local, **never-pushed** commit (`7c9d052`, "feat: M2 MCP endpoint…") contains the name from a two-tab test screenshot as a test fixture. It was replaced with "Mina" in a later commit, so it no longer appears in the current files. Once pushed publicly, history is effectively permanent: forks and caches keep it even if rewritten later.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Scrub it before pushing**: rewrite the unpushed commits so the name never appears. Safe now, because nothing after the template's initial commit has been pushed; every later commit gets a new hash, which affects no one yet.
- **B — Publish as is**: e.g. if it's your own name and you don't mind it appearing in a test file's history.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**A — Scrub it before pushing.** *Rationale*: It's a free fix *only* until the first push, and irreversible after. If it's a friend's name, it isn't ours to publish; if it's yours, A costs nothing either. *Confidence*: 0.7 — because this is about your preference, and the only fact I know is that the window to fix it closes at the push. *If wrong*: if it's your own name and you're happy to have it visible, this flips to **B**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Links

* Implements milestone M4 of [ADR-0003](0003-step-1-shareable-web-chat-with-my-agent.md) (hosting: QST-HOSTING-COST = E)
* Agent reconnects: [ADR-0006](0006-m3-the-agent-harness.md); TD-2 in [`docs/TECHNICAL-DEBT.md`](../TECHNICAL-DEBT.md)
