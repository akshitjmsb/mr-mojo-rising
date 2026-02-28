export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      songs: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          artist: string | null;
          youtube_url: string;
          status: "pending" | "queued" | "processing" | "ready" | "failed";
          processing_stage: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          artist?: string | null;
          youtube_url: string;
          status?: "pending" | "queued" | "processing" | "ready" | "failed";
          processing_stage?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          artist?: string | null;
          youtube_url?: string;
          status?: "pending" | "queued" | "processing" | "ready" | "failed";
          processing_stage?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stems: {
        Row: {
          id: string;
          song_id: string;
          original_url: string | null;
          guitar_url: string | null;
          vocals_url: string | null;
          drums_url: string | null;
          bass_url: string | null;
        };
        Insert: {
          id?: string;
          song_id: string;
          original_url?: string | null;
          guitar_url?: string | null;
          vocals_url?: string | null;
          drums_url?: string | null;
          bass_url?: string | null;
        };
        Update: {
          id?: string;
          song_id?: string;
          original_url?: string | null;
          guitar_url?: string | null;
          vocals_url?: string | null;
          drums_url?: string | null;
          bass_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stems_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: true;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      sections: {
        Row: {
          id: string;
          song_id: string;
          label: string;
          start_time: number;
          end_time: number;
        };
        Insert: {
          id?: string;
          song_id: string;
          label: string;
          start_time: number;
          end_time: number;
        };
        Update: {
          id?: string;
          song_id?: string;
          label?: string;
          start_time?: number;
          end_time?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sections_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: false;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      chords: {
        Row: {
          id: string;
          song_id: string;
          start_time: number;
          end_time: number;
          chord_label: string;
          chord_standard: string;
          confidence: number | null;
        };
        Insert: {
          id?: string;
          song_id: string;
          start_time: number;
          end_time: number;
          chord_label: string;
          chord_standard: string;
          confidence?: number | null;
        };
        Update: {
          id?: string;
          song_id?: string;
          start_time?: number;
          end_time?: number;
          chord_label?: string;
          chord_standard?: string;
          confidence?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "chords_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: false;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      lyrics: {
        Row: {
          id: string;
          song_id: string;
          synced_lrc: string | null;
          plain_text: string | null;
          source: string;
        };
        Insert: {
          id?: string;
          song_id: string;
          synced_lrc?: string | null;
          plain_text?: string | null;
          source: string;
        };
        Update: {
          id?: string;
          song_id?: string;
          synced_lrc?: string | null;
          plain_text?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lyrics_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: true;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      processing_jobs: {
        Row: {
          id: string;
          song_id: string;
          user_id: string;
          youtube_url: string;
          status: "queued" | "running" | "retryable" | "failed" | "succeeded";
          attempt_count: number;
          max_attempts: number;
          run_after: string;
          locked_by: string | null;
          locked_at: string | null;
          heartbeat_at: string | null;
          last_error: string | null;
          error_code: string | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          song_id: string;
          user_id: string;
          youtube_url: string;
          status?: "queued" | "running" | "retryable" | "failed" | "succeeded";
          attempt_count?: number;
          max_attempts?: number;
          run_after?: string;
          locked_by?: string | null;
          locked_at?: string | null;
          heartbeat_at?: string | null;
          last_error?: string | null;
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          song_id?: string;
          user_id?: string;
          youtube_url?: string;
          status?: "queued" | "running" | "retryable" | "failed" | "succeeded";
          attempt_count?: number;
          max_attempts?: number;
          run_after?: string;
          locked_by?: string | null;
          locked_at?: string | null;
          heartbeat_at?: string | null;
          last_error?: string | null;
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "processing_jobs_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: true;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "processing_jobs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_next_job: {
        Args: {
          worker_id: string;
        };
        Returns: Database["public"]["Tables"]["processing_jobs"]["Row"][];
      };
      requeue_stale_jobs: {
        Args: {
          timeout_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["processing_jobs"]["Row"][];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
