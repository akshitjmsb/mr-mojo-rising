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
          status: "pending" | "processing" | "ready" | "failed";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          artist?: string | null;
          youtube_url: string;
          status?: "pending" | "processing" | "ready" | "failed";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          artist?: string | null;
          youtube_url?: string;
          status?: "pending" | "processing" | "ready" | "failed";
          created_at?: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
