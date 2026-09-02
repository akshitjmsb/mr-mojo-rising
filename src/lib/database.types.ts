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

export type PracticeProfile = {
  song_id: string;
  tuning_id: string;
  tuning_name: string;
  tuning_offset: number;
  chord_shape_shift: number;
  tab_confidence_threshold: number;
  source: "default" | "curated" | "manual";
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

export type StemLayer = {
  id: string;
  song_id: string;
  layer_key: string;
  label: string;
  instrument: "full" | "vocals" | "guitar" | "bass" | "drums" | "other";
  role: string;
  url: string;
  source_model: string | null;
  quality_status: "preview" | "ready";
  is_learnable: 0 | 1;
  sort_order: number;
  updated_at: number;
  quality_gate_status?: "ready" | "best_available" | null;
  quality_score?: number | null;
  quality_summary?: string | null;
  quality_checks_json?: string | null;
  quality_evidence_version?: string | null;
};

export type StemQualityReport = {
  id: string;
  song_id: string;
  layer_key: string;
  status: "ready" | "best_available";
  score: number;
  summary: string;
  checks_json: string;
  evidence_version: string;
  updated_at: number;
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
  verification_method?: string;
  evidence_version?: string;
  acoustic_score?: number;
  score_margin?: number;
  frame_stability?: number;
  bass_support?: number | null;
  verification_state?: "verified" | "withheld";
  verification_reason?: string;
};

// One transcribed note on the guitar stem, mapped to a fretboard position.
// string_num follows tab convention: 1 = high E … 6 = low E.
export type TabNote = {
  id: string;
  song_id: string;
  start_time: number;
  duration: number;
  midi_pitch: number;
  string_num: number;
  fret: number;
  confidence: number | null;
  role?: "lead" | "rhythm" | "unknown";
  role_confidence?: number | null;
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

export type WorkerCommand = {
  id: string;
  command: "restart";
  status: "queued" | "claimed" | "done" | "failed";
  requested_at: number;
  claimed_at: number | null;
  handled_at: number | null;
  handled_by: string | null;
  message: string | null;
};
