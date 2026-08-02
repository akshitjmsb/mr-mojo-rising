import { NextResponse } from "next/server";
import { queryAll } from "@/lib/queries";
import type { Song } from "@/lib/database.types";

export async function GET() {
  try {
    const songs = await queryAll<
      Song & {
        worker_online_count: number;
        latest_worker_heartbeat_at: number | null;
        preview_ready: number;
      }
    >(
      `SELECT
         s.*,
         EXISTS(
           SELECT 1 FROM stems st
           WHERE st.song_id = s.id
             AND st.original_url IS NOT NULL
             AND st.guitar_url IS NOT NULL
             AND st.vocals_url IS NOT NULL
             AND st.drums_url IS NOT NULL
             AND st.bass_url IS NOT NULL
         ) AS preview_ready,
         (
           SELECT COUNT(*)
           FROM worker_status ws
           WHERE ws.status IN ('idle', 'running', 'starting')
             AND ws.heartbeat_at >= unixepoch() - 90
         ) AS worker_online_count,
         (
           SELECT MAX(ws.heartbeat_at)
           FROM worker_status ws
         ) AS latest_worker_heartbeat_at
       FROM songs s
       ORDER BY s.created_at DESC`,
    );
    return NextResponse.json(songs);
  } catch (err) {
    console.error("Failed to fetch songs", err);
    return NextResponse.json({ error: "Failed to fetch songs" }, { status: 500 });
  }
}
