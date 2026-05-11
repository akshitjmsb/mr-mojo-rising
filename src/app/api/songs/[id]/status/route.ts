import { NextResponse } from "next/server";
import { queryOne } from "@/lib/queries";

type Status = {
  id: string;
  status: string;
  processing_stage: string | null;
  last_error: string | null;
  updated_at: number;
  job_status: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
  run_after: number | null;
  locked_by: string | null;
  locked_at: number | null;
  heartbeat_at: number | null;
  queue_position: number | null;
  worker_online_count: number;
  latest_worker_heartbeat_at: number | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const song = await queryOne<Status>(
    `SELECT
       s.id,
       s.status,
       s.processing_stage,
       s.last_error,
       s.updated_at,
       pj.status AS job_status,
       pj.attempt_count,
       pj.max_attempts,
       pj.run_after,
       pj.locked_by,
       pj.locked_at,
       pj.heartbeat_at,
       (
         SELECT COUNT(*)
         FROM worker_status ws
         WHERE ws.status IN ('idle', 'running', 'starting')
           AND ws.heartbeat_at >= unixepoch() - 90
       ) AS worker_online_count,
       (
         SELECT MAX(ws.heartbeat_at)
         FROM worker_status ws
       ) AS latest_worker_heartbeat_at,
       CASE
         WHEN pj.status IN ('queued', 'retryable') THEN (
           SELECT COUNT(*) + 1
           FROM processing_jobs ahead
           WHERE ahead.status IN ('queued', 'retryable')
             AND (
               ahead.run_after < pj.run_after
               OR (ahead.run_after = pj.run_after AND ahead.created_at <= pj.created_at)
             )
         )
         ELSE NULL
       END AS queue_position
     FROM songs s
     LEFT JOIN processing_jobs pj ON pj.song_id = s.id
     WHERE s.id = ?`,
    [id],
  );

  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  return NextResponse.json(song);
}
