<!-- adr template version: "adr-madr 3.12.0" -->
<!-- kept in deliberate homage to MADR — Markdown Architectural Decision Records, the lineage this template family descends from. This is the simple-decisions form: use it when a decision needs recording, not discussion. The deliberation-native form is adr.md. Mint with `just adr "<title>" madr`. (Ruling: QST-MADR-FATE, 2026-08-13 — "keeping the template, acknowledging it, is good form.") -->

# M1 — Project Scaffold and a Humans-Only Chat

* Status: accepted
* Deciders: Saddler 5.5 (claude-opus-5-5), within the decisions 3XIA00 made in ADR-0002 and ADR-0003; 3XIA00 may override any line
* Date: 2026-11-19

**TL;DR**: One npm package; `src/server` (plain Node `http` + `ws`, Postgres via `pg` and plain SQL), `src/client` (React + Vite), `src/shared` (the wire types both import); rooms are unguessable links whose members are *participants* (human or agent); `npm run check` (typecheck + tests against the real database) joins `just gate`.

Technical Story: ADR-0003 Action Items, milestone **M1**: "two browser tabs can chat in a 1:1 room; messages stored in Postgres; runs on localhost."

## Context and Problem Statement

ADR-0002 fixed the language and toolchain (TypeScript, Node 26 via asdf, npm + tsc + Vitest). ADR-0003 fixed the architecture (Node + WebSockets + React/Vite, Neon Postgres, agents as participants joining over MCP later). M1 has to turn that into a working skeleton without picking anything that M2 (the MCP endpoint) or M3 (the agent harness) would have to undo.

## Decision Drivers

* **Visibility over framework magic.** The room → message → subscriber path is the core of what M2 and M3 extend; it should be our code, readable top to bottom.
* **Few dependencies.** Each one is something to learn and something that can break.
* **The participant abstraction** (ADR-0003 Consequences): humans and agents must be the same kind of thing in the data model from day one.
* **An in-process event hook** M2 can attach MCP notifications to, without touching the WebSocket code.

## Considered Options

* **Repo shape**: one npm package with three folders ✔ · npm workspaces (three packages)
* **Server**: plain `node:http` + `ws` ✔ · Express/Fastify + `ws` · Socket.IO
* **Database access**: `pg` + plain SQL schema file ✔ · Drizzle ORM · Neon's serverless driver
* **Running TypeScript on the server**: `tsx` (dev and, for now, prod) ✔ · compile with `tsc` to `dist/`

## Decision Outcome

Chosen: the ✔ options above, because each is the smallest option that meets the drivers.

* **One package** keeps a single `package.json`, `tsconfig.json`, and `npm run check`. Workspaces pay off with separately published packages, which we don't have.
* **`node:http` + `ws`**: phase 1's HTTP surface is two routes (create a room, serve the page). Socket.IO adds its own protocol on top of WebSockets, and that would get between us and M2/M3.
* **`pg` + `src/server/schema.sql`**: the schema is three tables; plain SQL shows exactly what's stored. `npm run db:migrate` applies it idempotently (`CREATE TABLE IF NOT EXISTS`).
* **`tsx`** runs `.ts` directly, so there's no build step for the server. The client is built by Vite.
* **Room ids** are 128-bit random tokens (`/r/<token>`). Unguessable links are the only "access control" phase 1 has (ADR-0003 QST-ACCESS-COST).
* **Secrets** come from `.env` (gitignored) via Node's built-in `process.loadEnvFile()`, so there's no `dotenv` dependency.

### Data model

```sql
rooms        (id text PK, created_at)
participants (id text PK, room_id → rooms, kind 'human'|'agent', display_name, created_at)
messages     (id bigserial PK, room_id → rooms, participant_id → participants, body, created_at)
```

### Wire protocol (WebSocket JSON, typed in `src/shared/protocol.ts`)

* client → server: `join {roomId, displayName}` · `send {body}`
* server → client: `joined {participant, history}` · `message {message}` · `error {error}`

### Positive Consequences

* The `RoomService` emits a `message` event per room. M2's MCP notifications subscribe to the same event the WebSocket fan-out uses, so M2 adds a second subscriber and changes nothing else.
* An agent is just a `participants` row with `kind = 'agent'`.

### Negative Consequences

* **Tests hit the real database in `.env`.** That's honest coverage of the SQL, but `just gate` now needs network access to Neon (see QST-TEST-DB).
* Running `tsx` in production (M4) is a toy-project shortcut; noted for M4.

## Open question

### QST-TEST-DB: Which Neon database should development and tests use?
- Status: unanswered
- Why asking: M1's tests create rooms and messages in whatever database `DATABASE_URL` in `.env` points to. Today that's presumably your Neon project's main branch, which M4 will also deploy against, so test rows would mix with real friends' chats. Neon can make a **branch**: an instant, free copy of the database with its own connection string.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — One database for everything**: keep the current `DATABASE_URL`; tests clean up the rooms they create. Simplest; test debris is possible if a test crashes mid-run.
- **B — A `dev` branch for development and tests**: in the Neon console, create a branch named `dev` and put *its* connection string in `.env`. At M4, Render gets the main branch's string. Real chats and test runs never mix.
- **C — Local Postgres for tests**: install Postgres in WSL for tests only. No network needed for the gate, but it's one more thing to install and keep running.

**Recommendation**: (by Saddler 5.5, claude-opus-5-5, 2026-11-19)

**B — A `dev` branch.** *Rationale*: It costs one click and one edited `.env` line, and it's exactly what Neon branches are for. A is fine *until M4*, when friends' messages start living in the same database the test suite writes to. C buys offline gates at the price of a second database setup, which a toy project doesn't need. *Confidence*: 0.8 — because branching is Neon's documented workflow for this, and nothing in M1 depends on which branch is used. *If wrong*: if the gate needing network turns out painful (e.g. you often work offline), this flips to **C**.

**ANS:** (by [name])
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Links

* Implements milestone M1 of [ADR-0003](0003-step-1-shareable-web-chat-with-my-agent.md)
* Toolchain from [ADR-0002](0002-implementation-language-and-runtime.md)
