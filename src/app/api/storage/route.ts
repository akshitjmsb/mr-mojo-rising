import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/queries";

const HOBBY_STORAGE_LIMIT_BYTES = 1_000_000_000;
const MAX_LIST_PAGES = 100;

async function blobStorageBytes() {
  let total = 0;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await list({ limit: 1_000, cursor });
    for (const blob of result.blobs) total += blob.size;
    if (!result.hasMore || !result.cursor) return total;
    cursor = result.cursor;
  }

  throw new Error("Blob listing exceeded the safety page limit.");
}

export async function GET() {
  try {
    const songsPromise = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM songs
       WHERE status = 'ready' AND processing_stage = 'complete'`,
    );
    const [usedBytes, songRow] = await Promise.all([
      blobStorageBytes(),
      songsPromise,
    ]);
    const songCount = Number(songRow?.count ?? 0);
    const averageSongBytes = songCount > 0 ? usedBytes / songCount : 0;
    const remainingBytes = Math.max(0, HOBBY_STORAGE_LIMIT_BYTES - usedBytes);
    const estimatedSongsRemaining =
      averageSongBytes > 0
        ? Math.floor(remainingBytes / averageSongBytes)
        : null;

    return NextResponse.json(
      {
        used_bytes: usedBytes,
        limit_bytes: HOBBY_STORAGE_LIMIT_BYTES,
        remaining_bytes: remainingBytes,
        song_count: songCount,
        average_song_bytes: Math.round(averageSongBytes),
        estimated_songs_remaining: estimatedSongsRemaining,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[api/storage] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Storage usage is temporarily unavailable." },
      { status: 503 },
    );
  }
}
