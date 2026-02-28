#!/usr/bin/env python3
"""
Latency benchmark for Mr. Mojo Rising worker pipeline.

Creates benchmark songs/jobs directly in Supabase, waits for completion, and
reports p50/p95 latency metrics. Optional worker JSON logs can be parsed to
include stage-level durations from `pipeline.stage_done` events.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from supabase import Client, create_client
except ModuleNotFoundError as exc:
    print(
        "Missing dependency: supabase. Run with worker venv, e.g. "
        "`./venv/bin/python bench/latency_bench.py ...`",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc

TARGET_P50_IMPROVEMENT = 30
TARGET_P95_IMPROVEMENT = 20


@dataclass
class SongRun:
    index: int
    song_id: str
    job_id: str
    youtube_url: str
    status: str
    total_seconds: float | None
    queue_claim_delay_seconds: float | None
    attempt_count: int | None
    last_error: str | None
    stage_durations_ms: dict[str, int]


def parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    values_sorted = sorted(values)
    idx = (len(values_sorted) - 1) * pct / 100
    low = math.floor(idx)
    high = math.ceil(idx)
    if low == high:
        return values_sorted[low]
    frac = idx - low
    return values_sorted[low] * (1 - frac) + values_sorted[high] * frac


def parse_worker_log(path: Path) -> dict[str, dict[str, int]]:
    stage_durations: dict[str, dict[str, int]] = {}
    if not path.exists():
        return stage_durations

    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if payload.get("event") != "pipeline.stage_done":
                continue
            song_id = payload.get("song_id")
            stage = payload.get("stage")
            duration_ms = payload.get("duration_ms")
            if not song_id or not stage or not isinstance(duration_ms, int):
                continue
            stage_durations.setdefault(song_id, {})[stage] = duration_ms

    return stage_durations


def create_benchmark_song(sb: Client, user_id: str, youtube_url: str) -> tuple[str, str]:
    song_result = (
        sb.table("songs")
        .insert(
            {
                "user_id": user_id,
                "title": "Benchmark Pending",
                "youtube_url": youtube_url,
                "status": "queued",
                "processing_stage": "queued",
                "last_error": None,
            }
        )
        .select("id")
        .single()
        .execute()
    )
    song = song_result.data
    if not song:
        raise RuntimeError("failed to create benchmark song row")

    job_result = (
        sb.table("processing_jobs")
        .insert(
            {
                "song_id": song["id"],
                "user_id": user_id,
                "youtube_url": youtube_url,
                "status": "queued",
            }
        )
        .select("id")
        .single()
        .execute()
    )
    job = job_result.data
    if not job:
        raise RuntimeError("failed to create processing job row")

    return song["id"], job["id"]


def wait_for_completion(
    sb: Client,
    song_id: str,
    timeout_seconds: int,
    poll_interval_seconds: float,
) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        song_result = (
            sb.table("songs")
            .select("id,status,processing_stage,last_error,created_at,updated_at")
            .eq("id", song_id)
            .single()
            .execute()
        )
        song = song_result.data
        if not song:
            raise RuntimeError(f"song disappeared: {song_id}")
        if song["status"] in {"ready", "failed"}:
            return song
        time.sleep(poll_interval_seconds)
    raise TimeoutError(f"timeout waiting for song {song_id}")


def fetch_job(sb: Client, song_id: str) -> dict[str, Any]:
    result = (
        sb.table("processing_jobs")
        .select("id,status,attempt_count,created_at,locked_at,started_at,finished_at,last_error,error_code")
        .eq("song_id", song_id)
        .single()
        .execute()
    )
    if not result.data:
        raise RuntimeError(f"processing_job missing for song {song_id}")
    return result.data


def summarize(runs: list[SongRun]) -> dict[str, Any]:
    totals = [r.total_seconds for r in runs if r.total_seconds is not None]
    queue_claim = [r.queue_claim_delay_seconds for r in runs if r.queue_claim_delay_seconds is not None]
    failures = [r for r in runs if r.status != "ready"]
    stage_names = sorted({k for r in runs for k in r.stage_durations_ms.keys()})

    stages_summary: dict[str, dict[str, float]] = {}
    for stage in stage_names:
        vals_sec = [r.stage_durations_ms[stage] / 1000 for r in runs if stage in r.stage_durations_ms]
        if not vals_sec:
            continue
        stages_summary[stage] = {
            "p50_seconds": round(percentile(vals_sec, 50) or 0, 3),
            "p95_seconds": round(percentile(vals_sec, 95) or 0, 3),
            "mean_seconds": round(statistics.mean(vals_sec), 3),
        }

    return {
        "count": len(runs),
        "ready_count": len(runs) - len(failures),
        "failed_count": len(failures),
        "p50_total_seconds": round(percentile(totals, 50) or 0, 3) if totals else None,
        "p95_total_seconds": round(percentile(totals, 95) or 0, 3) if totals else None,
        "p50_queue_claim_delay_seconds": round(percentile(queue_claim, 50) or 0, 3) if queue_claim else None,
        "p95_queue_claim_delay_seconds": round(percentile(queue_claim, 95) or 0, 3) if queue_claim else None,
        "stages": stages_summary,
        "targets": {
            "p50_improvement_target_percent": TARGET_P50_IMPROVEMENT,
            "p95_improvement_target_percent": TARGET_P95_IMPROVEMENT,
            "failure_rate_target": "no increase",
        },
    }


def load_urls(path: Path, limit: int) -> list[str]:
    urls = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return urls[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark worker latency over N songs")
    parser.add_argument("--urls-file", type=Path, required=True, help="Text file with one YouTube URL per line")
    parser.add_argument("--user-id", required=True, help="Existing auth.users.id used for benchmark rows")
    parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL"), help="Supabase URL")
    parser.add_argument("--supabase-service-key", default=os.environ.get("SUPABASE_SERVICE_KEY"), help="Supabase service role key")
    parser.add_argument("--limit", type=int, default=10, help="How many URLs to run (default: 10)")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="Polling interval in seconds")
    parser.add_argument("--timeout-seconds", type=int, default=1800, help="Per-song timeout in seconds")
    parser.add_argument("--worker-log-file", type=Path, help="Optional JSON log file to parse stage durations")
    parser.add_argument("--out", type=Path, help="Optional output JSON file")
    args = parser.parse_args()

    if not args.supabase_url or not args.supabase_service_key:
        raise RuntimeError("Missing Supabase credentials; pass --supabase-url and --supabase-service-key")

    urls = load_urls(args.urls_file, args.limit)
    if not urls:
        raise RuntimeError("No URLs provided")

    sb = create_client(args.supabase_url, args.supabase_service_key)
    runs: list[SongRun] = []
    print(f"Running benchmark for {len(urls)} songs...")

    for idx, url in enumerate(urls, start=1):
        run_id = uuid.uuid4().hex[:8]
        print(f"[{idx}/{len(urls)}] queueing: {url} (run={run_id})")

        song_id, job_id = create_benchmark_song(sb, args.user_id, url)

        try:
            song = wait_for_completion(
                sb=sb,
                song_id=song_id,
                timeout_seconds=args.timeout_seconds,
                poll_interval_seconds=args.poll_interval,
            )
        except TimeoutError as exc:
            runs.append(
                SongRun(
                    index=idx,
                    song_id=song_id,
                    job_id=job_id,
                    youtube_url=url,
                    status="timeout",
                    total_seconds=None,
                    queue_claim_delay_seconds=None,
                    attempt_count=None,
                    last_error=str(exc),
                    stage_durations_ms={},
                )
            )
            continue

        job = fetch_job(sb, song_id)
        created_at = parse_iso(job.get("created_at"))
        locked_at = parse_iso(job.get("locked_at"))
        finished_at = parse_iso(job.get("finished_at"))

        queue_claim_delay = None
        if created_at and locked_at:
            queue_claim_delay = (locked_at - created_at).total_seconds()

        total_seconds = None
        if created_at and finished_at:
            total_seconds = (finished_at - created_at).total_seconds()
        elif created_at:
            updated_at = parse_iso(song.get("updated_at"))
            if updated_at:
                total_seconds = (updated_at - created_at).total_seconds()

        runs.append(
            SongRun(
                index=idx,
                song_id=song_id,
                job_id=job_id,
                youtube_url=url,
                status=song["status"],
                total_seconds=total_seconds,
                queue_claim_delay_seconds=queue_claim_delay,
                attempt_count=job.get("attempt_count"),
                last_error=song.get("last_error") or job.get("last_error"),
                stage_durations_ms={},
            )
        )
        print(f"  -> {song['status']} total={total_seconds}s claim_delay={queue_claim_delay}s")

    if args.worker_log_file:
        stage_map = parse_worker_log(args.worker_log_file)
        for run in runs:
            run.stage_durations_ms = stage_map.get(run.song_id, {})

    summary = summarize(runs)
    payload = {
        "summary": summary,
        "runs": [r.__dict__ for r in runs],
    }

    print(json.dumps(summary, indent=2))
    if args.out:
        args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Wrote benchmark report: {args.out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
