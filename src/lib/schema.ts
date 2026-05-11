export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    artist TEXT,
    youtube_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('pending', 'queued', 'processing', 'ready', 'failed')),
    processing_stage TEXT,
    last_error TEXT,
    bpm REAL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,

  `CREATE TABLE IF NOT EXISTS stems (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
    original_url TEXT,
    guitar_url TEXT,
    vocals_url TEXT,
    drums_url TEXT,
    bass_url TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS chords (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    chord_label TEXT NOT NULL,
    chord_standard TEXT NOT NULL,
    confidence REAL
  )`,

  `CREATE TABLE IF NOT EXISTS lyrics (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
    synced_lrc TEXT,
    plain_text TEXT,
    source TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
    user_id TEXT,
    youtube_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'running', 'retryable', 'failed', 'succeeded')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    run_after INTEGER NOT NULL DEFAULT (unixepoch()),
    locked_by TEXT,
    locked_at INTEGER,
    heartbeat_at INTEGER,
    last_error TEXT,
    error_code TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    started_at INTEGER,
    finished_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS worker_status (
    worker_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'idle'
      CHECK (status IN ('starting', 'idle', 'running', 'stopped')),
    current_job_id TEXT,
    current_song_id TEXT,
    started_at INTEGER NOT NULL DEFAULT (unixepoch()),
    heartbeat_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,

  `CREATE INDEX IF NOT EXISTS songs_status_created_idx
    ON songs (status, created_at DESC)`,

  `CREATE INDEX IF NOT EXISTS sections_song_start_idx
    ON sections (song_id, start_time)`,

  `CREATE INDEX IF NOT EXISTS chords_song_start_idx
    ON chords (song_id, start_time)`,

  `CREATE INDEX IF NOT EXISTS processing_jobs_status_run_after_idx
    ON processing_jobs (status, run_after, created_at)`,

  `CREATE INDEX IF NOT EXISTS processing_jobs_heartbeat_idx
    ON processing_jobs (heartbeat_at)
    WHERE status = 'running'`,

  `CREATE INDEX IF NOT EXISTS worker_status_heartbeat_idx
    ON worker_status (heartbeat_at)`,
];
