export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chords: {
        Row: {
          chord_label: string
          chord_standard: string
          confidence: number | null
          end_time: number
          id: string
          song_id: string
          start_time: number
        }
        Insert: {
          chord_label: string
          chord_standard: string
          confidence?: number | null
          end_time: number
          id?: string
          song_id: string
          start_time: number
        }
        Update: {
          chord_label?: string
          chord_standard?: string
          confidence?: number | null
          end_time?: number
          id?: string
          song_id?: string
          start_time?: number
        }
        Relationships: [
          {
            foreignKeyName: "chords_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      lyrics: {
        Row: {
          id: string
          plain_text: string | null
          song_id: string
          source: string
          synced_lrc: string | null
        }
        Insert: {
          id?: string
          plain_text?: string | null
          song_id: string
          source: string
          synced_lrc?: string | null
        }
        Update: {
          id?: string
          plain_text?: string | null
          song_id?: string
          source?: string
          synced_lrc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lyrics_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: true
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          error_code: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          run_after: string
          song_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          youtube_url: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          run_after?: string
          song_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          youtube_url: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          run_after?: string
          song_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: true
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          end_time: number
          id: string
          label: string
          song_id: string
          start_time: number
        }
        Insert: {
          end_time: number
          id?: string
          label: string
          song_id: string
          start_time: number
        }
        Update: {
          end_time?: number
          id?: string
          label?: string
          song_id?: string
          start_time?: number
        }
        Relationships: [
          {
            foreignKeyName: "sections_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          artist: string | null
          bpm: number | null
          created_at: string
          id: string
          last_error: string | null
          processing_stage: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
          youtube_url: string
        }
        Insert: {
          artist?: string | null
          bpm?: number | null
          created_at?: string
          id?: string
          last_error?: string | null
          processing_stage?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
          youtube_url: string
        }
        Update: {
          artist?: string | null
          bpm?: number | null
          created_at?: string
          id?: string
          last_error?: string | null
          processing_stage?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          youtube_url?: string
        }
        Relationships: []
      }
      stems: {
        Row: {
          bass_url: string | null
          drums_url: string | null
          guitar_url: string | null
          id: string
          original_url: string | null
          song_id: string
          vocals_url: string | null
        }
        Insert: {
          bass_url?: string | null
          drums_url?: string | null
          guitar_url?: string | null
          id?: string
          original_url?: string | null
          song_id: string
          vocals_url?: string | null
        }
        Update: {
          bass_url?: string | null
          drums_url?: string | null
          guitar_url?: string | null
          id?: string
          original_url?: string | null
          song_id?: string
          vocals_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stems_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: true
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_next_job: {
        Args: { worker_id: string }
        Returns: {
          attempt_count: number
          created_at: string
          error_code: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          run_after: string
          song_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          youtube_url: string
        }[]
      }
      requeue_stale_jobs: {
        Args: { timeout_seconds?: number }
        Returns: {
          attempt_count: number
          created_at: string
          error_code: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          run_after: string
          song_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          youtube_url: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
