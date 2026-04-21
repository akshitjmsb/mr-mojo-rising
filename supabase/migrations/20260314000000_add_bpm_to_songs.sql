-- Add BPM column to songs table for metronome support.
alter table songs add column if not exists bpm numeric(6, 2) null;
