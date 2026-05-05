import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { execute, queryOne } from "@/lib/queries";
import type { ProcessingJob, Song } from "@/lib/database.types";

export async function POST(request: Request) {
  try {
    const { youtube_url } = await request.json();

    if (!youtube_url || typeof youtube_url !== "string") {
      return NextResponse.json(
        { error: "YouTube URL is required" },
        { status: 400 },
      );
    }

    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/;
    if (!ytRegex.test(youtube_url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 },
      );
    }

    const songId = randomUUID();
    await execute(
      `INSERT INTO songs (id, user_id, title, youtube_url, status, processing_stage, last_error)
       VALUES (?, NULL, 'Processing...', ?, 'queued', 'queued', NULL)`,
      [songId, youtube_url],
    );

    const song = await queryOne<Song>(`SELECT * FROM songs WHERE id = ?`, [songId]);
    if (!song) {
      return NextResponse.json(
        { error: "Failed to create song record" },
        { status: 500 },
      );
    }

    const jobId = randomUUID();
    try {
      await execute(
        `INSERT INTO processing_jobs (id, song_id, user_id, youtube_url, status)
         VALUES (?, ?, NULL, ?, 'queued')`,
        [jobId, songId, youtube_url],
      );
    } catch (err) {
      console.error("Failed to enqueue job", err);
      await execute(
        `UPDATE songs
         SET status = 'failed', processing_stage = 'failed',
             last_error = 'Failed to queue processing job',
             updated_at = unixepoch()
         WHERE id = ?`,
        [songId],
      );
      return NextResponse.json(
        { error: "Failed to queue processing job" },
        { status: 500 },
      );
    }

    const job = await queryOne<ProcessingJob>(
      `SELECT * FROM processing_jobs WHERE id = ?`,
      [jobId],
    );

    return NextResponse.json({
      id: song.id,
      status: song.status,
      job_id: job?.id ?? jobId,
    });
  } catch (err) {
    console.error("Import failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
