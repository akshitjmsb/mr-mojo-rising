import { NextResponse } from "next/server";
import { queryAll } from "@/lib/queries";
import type { VocalTrack } from "@/lib/vocal-queue";

export async function GET() {
  try {
    const tracks = await queryAll<VocalTrack>(`
      SELECT s.id, s.title, s.artist, st.vocals_url AS url
      FROM songs s JOIN stems st ON st.song_id = s.id
      WHERE s.status = 'ready' AND s.processing_stage = 'complete'
        AND st.vocals_url IS NOT NULL AND st.vocals_url != ''
      ORDER BY COALESCE(s.artist, '') COLLATE NOCASE, s.title COLLATE NOCASE, s.id
    `);
    return NextResponse.json(tracks, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load vocal player", error);
    return NextResponse.json({ error: "Could not load your songs. Try again." }, { status: 503 });
  }
}
