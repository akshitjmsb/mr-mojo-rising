// Plain TypeScript row types for the Turso/SQLite schema.
// Timestamps are unix epoch seconds (INTEGER); IDs are TEXT (UUID strings).

export type SongStatus =
  | "pending"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type Song = {
  id: string;
  user_id: string | null;
  title: string;
  artist: string | null;
  youtube_url: string;
  status: SongStatus;
  processing_stage: string | null;
  last_error: string | null;
  bpm: number | null;
  created_at: number;
  updated_at: number;
};

export type Stem = {
  id: string;
  song_id: string;
  original_url: string | null;
  guitar_url: string | null;
  vocals_url: string | null;
  drums_url: string | null;
  bass_url: string | null;
};

export type Section = {
  id: string;
  song_id: string;
  label: string;
  start_time: number;
  end_time: number;
};

export type Chord = {
  id: string;
  song_id: string;
  start_time: number;
  end_time: number;
  chord_label: string;
  chord_standard: string;
  confidence: number | null;
};

export type Lyrics = {
  id: string;
  song_id: string;
  synced_lrc: string | null;
  plain_text: string | null;
  source: string;
};

export type ProcessingJobStatus =
  | "queued"
  | "running"
  | "retryable"
  | "failed"
  | "succeeded";

export type ProcessingJob = {
  id: string;
  song_id: string;
  user_id: string | null;
  youtube_url: string;
  status: ProcessingJobStatus;
  attempt_count: number;
  max_attempts: number;
  run_after: number;
  locked_by: string | null;
  locked_at: number | null;
  heartbeat_at: number | null;
  last_error: string | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
};

export type WorkerStatus = {
  worker_id: string;
  status: "starting" | "idle" | "running" | "stopped";
  current_job_id: string | null;
  current_song_id: string | null;
  started_at: number;
  heartbeat_at: number;
  updated_at: number;
};
