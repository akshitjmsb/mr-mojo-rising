import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { execute, queryAll, queryOne } from "@/lib/queries";
import type { WorkerStatus } from "@/lib/database.types";

const ONLINE_WINDOW_SECONDS = 90;

type WorkerRow = WorkerStatus & {
  heartbeat_age_seconds: number;
  is_online: number;
};

type QueueSummary = {
  queued: number;
  running: number;
  retryable: number;
  failed: number;
};

type LastCommand = {
  id: string;
  command: string;
  status: string;
  requested_at: number;
  claimed_at: number | null;
  handled_at: number | null;
  handled_by: string | null;
  message: string | null;
};

async function ensureWorkerCommandsTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS worker_commands (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL
        CHECK (command IN ('restart')),
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'claimed', 'done', 'failed')),
      requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
      claimed_at INTEGER,
      handled_at INTEGER,
      handled_by TEXT,
      message TEXT
    )`,
  );
  await execute(
    `CREATE INDEX IF NOT EXISTS worker_commands_status_requested_idx
      ON worker_commands (status, requested_at)`,
  );
}

async function getWorkerPayload() {
  await ensureWorkerCommandsTable();

  const workers = await queryAll<WorkerRow>(
    `SELECT
       worker_id,
       status,
       current_job_id,
       current_song_id,
       started_at,
       heartbeat_at,
       updated_at,
       unixepoch() - heartbeat_at AS heartbeat_age_seconds,
       CASE
         WHEN status IN ('idle', 'running', 'starting')
           AND heartbeat_at >= unixepoch() - ?
         THEN 1 ELSE 0
       END AS is_online
     FROM worker_status
     ORDER BY heartbeat_at DESC`,
    [ONLINE_WINDOW_SECONDS],
  );

  const queue = await queryOne<QueueSummary>(
    `SELECT
       SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
       SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
       SUM(CASE WHEN status = 'retryable' THEN 1 ELSE 0 END) AS retryable,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM processing_jobs
     WHERE status IN ('queued', 'running', 'retryable', 'failed')`,
  );

  const lastCommand = await queryOne<LastCommand>(
    `SELECT *
     FROM worker_commands
     ORDER BY requested_at DESC
     LIMIT 1`,
  );

  const onlineWorkers = workers.filter((worker) => worker.is_online === 1);
  const latestWorker = workers[0] ?? null;
  const hasQueuedWork =
    (queue?.queued ?? 0) > 0 || (queue?.retryable ?? 0) > 0;

  return {
    status: onlineWorkers.length > 0 ? "online" : "offline",
    online_count: onlineWorkers.length,
    latest_worker: latestWorker,
    workers,
    queue: {
      queued: queue?.queued ?? 0,
      running: queue?.running ?? 0,
      retryable: queue?.retryable ?? 0,
      failed: queue?.failed ?? 0,
      has_waiting_work: hasQueuedWork,
    },
    last_command: lastCommand,
    online_window_seconds: ONLINE_WINDOW_SECONDS,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await getWorkerPayload());
  } catch (err) {
    console.error("Failed to fetch worker status", err);
    return NextResponse.json(
      { error: "Failed to fetch worker status" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const command = body.command;

    if (command !== "restart") {
      return NextResponse.json({ error: "Unsupported command" }, { status: 400 });
    }

    const payload = await getWorkerPayload();
    if (payload.online_count === 0) {
      return NextResponse.json(
        {
          error:
            "Mac worker is offline. Start it on the Mac, then remote restart will be available.",
          payload,
        },
        { status: 409 },
      );
    }

    await execute(
      `INSERT INTO worker_commands (id, command, status, message)
       VALUES (?, 'restart', 'queued', ?)`,
      [randomUUID(), "Restart requested from app"],
    );

    return NextResponse.json(await getWorkerPayload());
  } catch (err) {
    console.error("Failed to send worker command", err);
    return NextResponse.json(
      { error: "Failed to send worker command" },
      { status: 500 },
    );
  }
}
