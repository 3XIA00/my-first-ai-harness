# Technical Debt

Architectural shortcuts taken on purpose, with where they live and how to pay them back.
See CLAUDE.md § Technical Debt Tracking.

---

## TD-1: An agent's identity is its display name

- **Issue**: The MCP endpoint identifies "the agent" by `AGENT_NAME`. Its room membership is found with `participants WHERE kind = 'agent' AND display_name = <name>`.
- **Location**: `src/server/rooms.ts` (`agentPresence`, `joinAsAgent`, `leaveAsAgent`), `src/server/mcp.ts` (`AgentConfig`).
- **Impact**: Fine with exactly one agent (phase 1). It breaks as soon as two agents could share a name, or an agent is renamed (its presence would be "lost" and the one-room rule bypassed).
- **Workaround**: Single `AGENT_TOKEN` + `AGENT_NAME` from the server environment.
- **Fix**: An `agents` table (id, owner, token hash, display name); participants get an `agent_id` foreign key; the bearer token resolves to an agent id. Needed before other people's agents connect (ADR-0005 Open Follow-ups, ADR-0001 QST-AGENT-INTEROP).
- **Priority**: Medium. Blocks the multi-agent phases, not phase 1.
- **Related lesson (M2 Inspector check, 2026-11-19)**: in MCP, an HTTP `401` with `WWW-Authenticate: Bearer` tells clients "start OAuth". When the Inspector's header was malformed, it went looking for `/.well-known/oauth-*` and `/register` and failed with a misleading "Dynamic Client Registration rejected (404)". Our fixed bearer token works only with clients that let you set the `Authorization` header by hand (the Inspector, our own harness). Off-the-shelf clients that expect OAuth can't connect. Per-agent tokens (this fix) or real OAuth must account for that before other people's agents arrive.

## TD-2: The server runs TypeScript through `tsx` in production

- **Issue**: There's no server build step; `tsx` transpiles on the fly.
- **Location**: `package.json` scripts; M4 deploy (ADR-0004 Negative Consequences).
- **Impact**: Slightly slower startup and an extra runtime dependency in production; harmless at toy scale.
- **Workaround**: Accept it for M4.
- **Fix**: Either compile with `tsc` to `dist/server`, or run with Node's native type stripping (`node src/server/index.ts`; the code already uses `.ts` import extensions and no TS-only runtime syntax).
- **Priority**: Low.
