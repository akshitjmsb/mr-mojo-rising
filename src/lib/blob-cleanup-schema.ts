// Deliberately no foreign key: cleanup must survive deletion of the song.
export const BLOB_CLEANUP_SCHEMA = `CREATE TABLE IF NOT EXISTS blob_cleanup_jobs (
  song_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  run_after INTEGER NOT NULL DEFAULT (unixepoch()),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
)`;
