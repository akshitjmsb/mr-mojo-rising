import type { ResultSet } from "@libsql/client";
import { getTursoClient } from "./turso";

export async function execute(
  sql: string,
  args: unknown[] = []
): Promise<ResultSet> {
  const client = getTursoClient();
  return client.execute({ sql, args: args as never });
}

export async function queryAll<T>(
  sql: string,
  args: unknown[] = []
): Promise<T[]> {
  const result = await execute(sql, args);
  return result.rows.map((row) => row as unknown as T);
}

export async function queryOne<T>(
  sql: string,
  args: unknown[] = []
): Promise<T | null> {
  const rows = await queryAll<T>(sql, args);
  return rows[0] ?? null;
}

// Atomically claim the next ready job. Replaces the Postgres claim_next_job
// function. SQLite has no `FOR UPDATE SKIP LOCKED`, but the libSQL HTTP API
// serializes write transactions, which is enough for a single-worker setup.
// For multi-worker, we use UPDATE ... RETURNING with a guarded WHERE clause
// so the second writer's update affects zero rows and we retry.
export async function claimNextJob(workerId: string) {
  const client = getTursoClient();
  const tx = await client.transaction("write");
  try {
    const candidate = await tx.execute({
      sql: `SELECT * FROM processing_jobs
            WHERE status IN ('queued', 'retryable')
              AND run_after <= unixepoch()
            ORDER BY run_after ASC, created_at ASC
            LIMIT 1`,
      args: [],
    });
    if (candidate.rows.length === 0) {
      await tx.commit();
      return null;
    }
    const row = candidate.rows[0] as Record<string, unknown>;
    const jobId = row.id as string;
    const previousStatus = row.status as string;

    const updated = await tx.execute({
      sql: `UPDATE processing_jobs
            SET status = 'running',
                locked_by = ?,
                locked_at = unixepoch(),
                heartbeat_at = unixepoch(),
                started_at = COALESCE(started_at, unixepoch()),
                attempt_count = attempt_count + 1,
                error_code = NULL,
                updated_at = unixepoch()
            WHERE id = ? AND status = ?
            RETURNING *`,
      args: [workerId, jobId, previousStatus],
    });

    await tx.commit();
    return (updated.rows[0] as Record<string, unknown>) ?? null;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// Recover stale running jobs whose worker stopped sending heartbeats.
// Returns the rows that were re-queued or marked failed.
export async function requeueStaleJobs(timeoutSeconds: number) {
  const client = getTursoClient();
  const tx = await client.transaction("write");
  try {
    const stale = await tx.execute({
      sql: `SELECT id, attempt_count, max_attempts, last_error, error_code, run_after, finished_at
            FROM processing_jobs
            WHERE status = 'running'
              AND heartbeat_at IS NOT NULL
              AND heartbeat_at < unixepoch() - ?`,
      args: [timeoutSeconds],
    });

    const recovered: Record<string, unknown>[] = [];

    for (const row of stale.rows) {
      const r = row as Record<string, unknown>;
      const id = r.id as string;
      const attemptCount = r.attempt_count as number;
      const maxAttempts = r.max_attempts as number;
      const lastError = (r.last_error as string | null) ?? "Worker heartbeat timed out";
      const errorCode = (r.error_code as string | null) ?? "heartbeat_timeout";

      const exhausted = attemptCount >= maxAttempts;
      const backoffSeconds = exhausted
        ? 0
        : Math.min(300, Math.max(15, Math.pow(2, Math.min(attemptCount, 10)) * 5));

      const updated = await tx.execute({
        sql: exhausted
          ? `UPDATE processing_jobs
             SET status = 'failed',
                 locked_by = NULL,
                 locked_at = NULL,
                 heartbeat_at = NULL,
                 last_error = ?,
                 error_code = ?,
                 finished_at = unixepoch(),
                 updated_at = unixepoch()
             WHERE id = ?
             RETURNING *`
          : `UPDATE processing_jobs
             SET status = 'retryable',
                 run_after = unixepoch() + ?,
                 locked_by = NULL,
                 locked_at = NULL,
                 heartbeat_at = NULL,
                 last_error = ?,
                 error_code = ?,
                 updated_at = unixepoch()
             WHERE id = ?
             RETURNING *`,
        args: exhausted ? [lastError, errorCode, id] : [backoffSeconds, lastError, errorCode, id],
      });

      if (updated.rows.length > 0) {
        recovered.push(updated.rows[0] as Record<string, unknown>);
      }
    }

    await tx.commit();
    return recovered;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
