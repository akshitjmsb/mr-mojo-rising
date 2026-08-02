import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = getTursoClient();
  const tx = await client.transaction("write");
  try {
    const songResult = await tx.execute({
      sql: `SELECT id, user_id, youtube_url FROM songs WHERE id = ?`,
      args: [id],
    });
    const song = songResult.rows[0] as unknown as
      | { id: string; user_id: string | null; youtube_url: string }
      | undefined;
    if (!song) {
      await tx.commit();
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    const jobResult = await tx.execute({
      sql: `SELECT id FROM processing_jobs WHERE song_id = ?`,
      args: [id],
    });
    const job = jobResult.rows[0] as unknown as { id: string } | undefined;
    const jobId = job?.id ?? randomUUID();

    await tx.execute({
      sql: `UPDATE songs
            SET status = 'queued', processing_stage = 'queued', last_error = NULL,
                updated_at = unixepoch()
            WHERE id = ?`,
      args: [id],
    });
    await tx.execute({
      sql: job
        ? `UPDATE processing_jobs
           SET status = 'queued', attempt_count = 0, run_after = unixepoch(),
               locked_by = NULL, locked_at = NULL, heartbeat_at = NULL,
               last_error = NULL, error_code = NULL, started_at = NULL,
               finished_at = NULL, updated_at = unixepoch()
           WHERE id = ?`
        : `INSERT INTO processing_jobs
             (id, song_id, user_id, youtube_url, status)
           VALUES (?, ?, ?, ?, 'queued')`,
      args: job
        ? [job.id]
        : [jobId, song.id, song.user_id, song.youtube_url],
    });
    await tx.commit();

    return NextResponse.json({ id: song.id, job_id: jobId, status: "queued" });
  } catch (err) {
    await tx.rollback();
    console.error("Retry failed", err);
    return NextResponse.json(
      { error: "Failed to retry song" },
      { status: 500 },
    );
  }
}
