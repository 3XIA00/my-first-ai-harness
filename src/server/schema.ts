// Room server schema (ADR-0004 "Data model"). Applied by migrate() in db.ts — by
// `npm run db:migrate`, on server start, and before tests.
//
// Kept as a TypeScript string rather than a .sql file read from disk: reading a file
// relative to `import.meta.url` breaks under the jsdom test environment (its URL is not a
// file: URL), and a string also travels with the code wherever it runs (M4 deploy).
// Idempotent on purpose: every statement is IF NOT EXISTS.
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS rooms (
  id          text PRIMARY KEY,                        -- 128-bit random token; the room's link
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Humans and agents alike are participants (ADR-0003 Consequences).
CREATE TABLE IF NOT EXISTS participants (
  id            text PRIMARY KEY,
  room_id       text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('human', 'agent')),
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              bigserial PRIMARY KEY,
  room_id         text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id  text NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_room_id_id ON messages (room_id, id);
`;
