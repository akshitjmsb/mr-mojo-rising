export const LESSON_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY, input_hash TEXT NOT NULL UNIQUE,
    source_url TEXT, transcript TEXT, description TEXT,
    title TEXT NOT NULL DEFAULT 'Guitar lesson',
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','ready','failed')),
    stage TEXT NOT NULL DEFAULT 'Waiting for Mac', pack_json TEXT, error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, locked_by TEXT, heartbeat_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS lesson_workers (
    id TEXT PRIMARY KEY, available INTEGER NOT NULL, message TEXT NOT NULL, heartbeat_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS lessons_queue ON lessons(status, created_at)`,
];
