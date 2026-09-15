import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { queryAll } from "@/lib/queries";
import { summarizeBlobStorage, storageCapacity } from "@/lib/storage-usage";

const HOBBY_STORAGE_LIMIT_BYTES = 1_000_000_000;
const MAX_LIST_PAGES = 100;

async function blobStorageInventory() {
  const blobs: Array<{ pathname: string; size: number }> = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await list({ limit: 1_000, cursor });
    blobs.push(...result.blobs);
    if (!result.hasMore || !result.cursor) return summarizeBlobStorage(blobs);
    cursor = result.cursor;
  }

  throw new Error("Blob listing exceeded the safety page limit.");
}

export async function GET() {
  try {
    const songsPromise = queryAll<{ id: string }>(
      `SELECT id FROM songs
       WHERE status = 'ready' AND processing_stage = 'complete'`,
    );
    const [inventory, songs] = await Promise.all([
      blobStorageInventory(),
      songsPromise,
    ]);
    const usedBytes = inventory.totalBytes;
    const songCount = songs.length;
    const { average: averageSongBytes, remaining: remainingBytes, estimatedSongs: estimatedSongsRemaining } =
      storageCapacity(inventory, songs.map(song => song.id), HOBBY_STORAGE_LIMIT_BYTES);

    return NextResponse.json(
      {
        used_bytes: usedBytes,
        limit_bytes: HOBBY_STORAGE_LIMIT_BYTES,
        remaining_bytes: remainingBytes,
        song_count: songCount,
        average_song_bytes: Math.round(averageSongBytes),
        estimated_songs_remaining: estimatedSongsRemaining,
        song_bytes: inventory.songBytes,
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
