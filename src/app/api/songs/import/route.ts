import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso";
import { canonicalizeYouTubeUrl } from "@/lib/youtube";

type ImportRow = {
  id: string;
  status: string;
  youtube_url: string;
  job_id: string | null;
};

export async function POST(request: Request) {
  try {
    const { youtube_url } = await request.json();

    if (!youtube_url || typeof youtube_url !== "string") {
      return NextResponse.json(
        { error: "YouTube URL is required" },
        { status: 400 },
      );
    }

    const canonicalUrl = canonicalizeYouTubeUrl(youtube_url);
    if (!canonicalUrl) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 },
      );
    }

    // Keep the read-and-create decision inside one serialized write
    // transaction. Two simultaneous imports of the same URL will therefore
    // converge on one song/job instead of duplicating expensive separation.
    const client = getTursoClient();
    const tx = await client.transaction("write");
    try {
      const candidateResult = await tx.execute({
        sql: `SELECT s.id, s.status, s.youtube_url, pj.id AS job_id
              FROM songs s
              LEFT JOIN processing_jobs pj ON pj.song_id = s.id
              WHERE s.status IN ('queued', 'processing', 'ready', 'failed')
              ORDER BY s.created_at DESC`,
        args: [],
      });
      const candidates = candidateResult.rows as unknown as ImportRow[];
      const sameVideo = (candidate: ImportRow) =>
        canonicalizeYouTubeUrl(candidate.youtube_url) === canonicalUrl;
      const existing = candidates.find(
        (candidate) =>
          candidate.status !== "failed" && sameVideo(candidate),
      );
      if (existing) {
        // Normalize legacy share URLs as they are encountered so subsequent
        // imports can use the fast exact form too.
        await tx.execute({
          sql: `UPDATE songs SET youtube_url = ?, updated_at = unixepoch() WHERE id = ?`,
          args: [canonicalUrl, existing.id],
        });
        if (existing.job_id) {
          await tx.execute({
            sql: `UPDATE processing_jobs SET youtube_url = ?, updated_at = unixepoch()
                  WHERE id = ?`,
            args: [canonicalUrl, existing.job_id],
          });
        }
        await tx.commit();
        return NextResponse.json({
          id: existing.id,
          status: existing.status,
          job_id: existing.job_id,
          reused: true,
        });
      }

      const failed = candidates.find(
        (candidate) => candidate.status === "failed" && sameVideo(candidate),
      );
      if (failed) {
        const jobId = failed.job_id ?? randomUUID();
        await tx.execute({
          sql: `UPDATE songs
                SET status = 'queued', processing_stage = 'queued', last_error = NULL,
                    youtube_url = ?, updated_at = unixepoch()
                WHERE id = ?`,
          args: [canonicalUrl, failed.id],
        });
        await tx.execute({
          sql: failed.job_id
            ? `UPDATE processing_jobs
               SET status = 'queued', attempt_count = 0, run_after = unixepoch(),
                   locked_by = NULL, locked_at = NULL, heartbeat_at = NULL,
                   last_error = NULL, error_code = NULL, started_at = NULL,
                   finished_at = NULL, youtube_url = ?, updated_at = unixepoch()
               WHERE id = ?`
            : `INSERT INTO processing_jobs
                 (id, song_id, user_id, youtube_url, status)
               VALUES (?, ?, NULL, ?, 'queued')`,
          args: failed.job_id
            ? [canonicalUrl, jobId]
            : [jobId, failed.id, canonicalUrl],
        });
        await tx.commit();
        return NextResponse.json({
          id: failed.id,
          status: "queued",
          job_id: jobId,
          reused: true,
        });
      }

      const songId = randomUUID();
      const jobId = randomUUID();
      await tx.execute({
        sql: `INSERT INTO songs
                (id, user_id, title, youtube_url, status, processing_stage, last_error)
              VALUES (?, NULL, 'Processing...', ?, 'queued', 'queued', NULL)`,
        args: [songId, canonicalUrl],
      });
      await tx.execute({
        sql: `INSERT INTO processing_jobs
                (id, song_id, user_id, youtube_url, status)
              VALUES (?, ?, NULL, ?, 'queued')`,
        args: [jobId, songId, canonicalUrl],
      });
      await tx.commit();

      return NextResponse.json({
        id: songId,
        status: "queued",
        job_id: jobId,
      });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (err) {
    console.error("Import failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
