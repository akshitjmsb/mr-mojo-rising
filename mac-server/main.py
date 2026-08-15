"""
Mr. Mojo Rising — Mac FastAPI Server
Durable queue worker for YouTube download, stem separation, section/chord analysis,
and lyrics fetching.
"""

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import traceback
import wave
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import librosa
import numpy as np
import soundfile as sf
import syncedlyrics
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from blob_storage import upload_file as blob_upload_file
from btc.inference import predict_chords as btc_predict_chords
from chord_truth_gate import (
    verify_chord_candidates,
    verified_count,
    verified_coverage,
)
from chord_reanalyze import (
    AudioNotFound,
    SongNotFound,
    reanalyze_chords as reanalyze_chords_for_song,
)
from lyrics_fetch import fetch_duration_matched_lyrics
from pipeline_cache import PipelineCheckpoint, source_cache_dir, valid_wav
from tab_transcribe import (
    TAB_TIMEOUT_SECONDS,
    transcribe_guitar_stem,
    write_tab_notes,
)
from turso_db import (
    claim_worker_command,
    claim_next_job,
    complete_worker_command,
    ensure_chord_verifications_table,
    ensure_stem_layers_table,
    ensure_worker_status_table,
    get_client as get_turso_client,
    new_id,
    requeue_stale_jobs,
    touch_worker_status,
    update_worker_status,
    write_chord_analysis,
)

app = FastAPI(title="Mr. Mojo Rising — Mac Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Config
API_SECRET = os.environ.get("API_SECRET", "dev-secret")
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/tmp/mojo-stems"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
PIPELINE_VERSION = os.environ.get("PIPELINE_VERSION", "hq-v3-coverage-first")

VENV_PYTHON = str(Path(__file__).resolve().parent / "venv" / "bin" / "python")
_VENV_YTDLP = Path(VENV_PYTHON).with_name("yt-dlp")
YTDLP_BIN = os.environ.get("YTDLP_BIN", str(_VENV_YTDLP) if _VENV_YTDLP.exists() else "yt-dlp")
WORKER_ID = os.environ.get("WORKER_ID", f"mac-worker-{os.getpid()}")
WORKER_CONCURRENCY = max(1, int(os.environ.get("WORKER_CONCURRENCY", "1")))
QUEUE_POLL_INTERVAL_SECONDS = float(os.environ.get("QUEUE_POLL_INTERVAL_SECONDS", "0.5"))
HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get("JOB_HEARTBEAT_INTERVAL_SECONDS", "15"))
WORKER_COMMAND_INTERVAL_SECONDS = float(os.environ.get("WORKER_COMMAND_INTERVAL_SECONDS", "5"))
HEARTBEAT_TIMEOUT_SECONDS = int(os.environ.get("JOB_HEARTBEAT_TIMEOUT_SECONDS", "300"))
MAX_BACKOFF_SECONDS = int(os.environ.get("JOB_MAX_BACKOFF_SECONDS", "300"))
JOB_TIMEOUT_SECONDS = int(os.environ.get("JOB_TIMEOUT_SECONDS", "3600"))
DEMUCS_PYTHON = os.environ.get("DEMUCS_PYTHON", VENV_PYTHON if Path(VENV_PYTHON).exists() else "python3.11")
DEMUCS_DEVICE = os.environ.get(
    "DEMUCS_DEVICE",
    "mps" if torch.backends.mps.is_built() and torch.backends.mps.is_available() else "cpu",
)
DEMUCS_JOBS = max(1, int(os.environ.get("DEMUCS_JOBS", "4")))
# htdemucs_ft is the fine-tuned 4-model ensemble: ~4x slower than htdemucs but
# noticeably cleaner stems (less bleed/warble on isolated vocals and guitar).
DEMUCS_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs_ft")
DEMUCS_SHIFTS = max(0, int(os.environ.get("DEMUCS_SHIFTS", "1")))
DEMUCS_SEGMENT = os.environ.get("DEMUCS_SEGMENT")
# Vocal refine pass: re-separates vocals with BS-Roformer (audio-separator),
# which is markedly cleaner than Demucs for voice. Demucs still provides
# drums/bass/guitar. Non-fatal — falls back to the Demucs vocals on failure.
SEPARATOR_BIN = os.environ.get(
    "SEPARATOR_BIN", str(Path(__file__).resolve().parent / "venv-sep" / "bin" / "audio-separator")
)
VOCAL_REFINE_ENABLED = os.environ.get("VOCAL_REFINE_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
VOCAL_REFINE_MODEL = os.environ.get("VOCAL_REFINE_MODEL", "model_bs_roformer_ep_317_sdr_12.9755.ckpt")
VOCAL_REFINE_TIMEOUT_SECONDS = int(os.environ.get("VOCAL_REFINE_TIMEOUT_SECONDS", "1800"))
# Guitar refine: MelBand Roformer trained specifically on guitar, so keys/synths
# stay out of the guitar stem (Demucs "other" lumps them all together).
# Registered via register_custom_models.py — not part of audio-separator itself.
GUITAR_REFINE_ENABLED = os.environ.get("GUITAR_REFINE_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
GUITAR_REFINE_MODEL = os.environ.get("GUITAR_REFINE_MODEL", "mel_band_roformer_guitar_becruily.ckpt")
SEPARATOR_MODEL_DIR = os.environ.get(
    "SEPARATOR_MODEL_DIR",
    str(Path.home() / "Library" / "Application Support" / "MrMojoRising" / "separator-models"),
)
SEPARATOR_USE_AUTOCAST = os.environ.get("SEPARATOR_USE_AUTOCAST", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
# Tab transcription: basic-pitch on the guitar stem → tab_notes rows.
# Non-fatal — a song without tabs still completes. Thresholds and the CLI
# path live in tab_transcribe.py (BASIC_PITCH_BIN, TAB_* env vars).
TAB_TRANSCRIBE_ENABLED = os.environ.get("TAB_TRANSCRIBE_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("YTDLP_DOWNLOAD_TIMEOUT_SECONDS", "300"))
FFMPEG_TIMEOUT_SECONDS = int(os.environ.get("FFMPEG_TIMEOUT_SECONDS", "180"))
DEMUCS_TIMEOUT_SECONDS = int(os.environ.get("DEMUCS_TIMEOUT_SECONDS", "2700"))
UPLOAD_TIMEOUT_SECONDS = int(os.environ.get("UPLOAD_TIMEOUT_SECONDS", "600"))
ANALYZE_TIMEOUT_SECONDS = int(os.environ.get("ANALYZE_TIMEOUT_SECONDS", "420"))
LYRICS_TIMEOUT_SECONDS = int(os.environ.get("LYRICS_TIMEOUT_SECONDS", "120"))
YTDLP_COOKIES_FROM_BROWSER = os.environ.get("YTDLP_COOKIES_FROM_BROWSER", "").strip()
WORKER_WARMUP_ENABLED = os.environ.get("WORKER_WARMUP_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

WORKER_TASKS: list[asyncio.Task] = []
REQUEUE_TASK: asyncio.Task | None = None
WORKER_STATUS_TASK: asyncio.Task | None = None
WORKER_COMMAND_TASK: asyncio.Task | None = None


class JobCancelled(RuntimeError):
    """Raised when a running job is deleted or loses its queue lease."""


def stage_start(*, stage: str, song_id: str, job_id: str) -> float:
    started = perf_counter()
    log_event("pipeline.stage_start", stage=stage, song_id=song_id, job_id=job_id)
    return started


def stage_done(*, stage: str, song_id: str, job_id: str, started: float):
    duration_ms = int((perf_counter() - started) * 1000)
    log_event(
        "pipeline.stage_done",
        stage=stage,
        song_id=song_id,
        job_id=job_id,
        duration_ms=duration_ms,
    )


def log_event(event: str, **fields):
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **fields,
    }
    print(json.dumps(payload, default=str), flush=True)


async def verify_token(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    token = authorization.removeprefix("Bearer ")
    if token != API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid API secret")


class ProcessRequest(BaseModel):
    song_id: str
    youtube_url: str


@app.on_event("startup")
async def startup_workers():
    global REQUEUE_TASK, WORKER_STATUS_TASK, WORKER_COMMAND_TASK

    log_event(
        "worker.startup",
        worker_id=WORKER_ID,
        concurrency=WORKER_CONCURRENCY,
        poll_interval_seconds=QUEUE_POLL_INTERVAL_SECONDS,
        command_interval_seconds=WORKER_COMMAND_INTERVAL_SECONDS,
        heartbeat_timeout_seconds=HEARTBEAT_TIMEOUT_SECONDS,
        job_timeout_seconds=JOB_TIMEOUT_SECONDS,
        demucs_python=DEMUCS_PYTHON,
        demucs_device=DEMUCS_DEVICE,
        demucs_jobs=DEMUCS_JOBS,
        demucs_model=DEMUCS_MODEL,
        demucs_shifts=DEMUCS_SHIFTS,
        demucs_segment=DEMUCS_SEGMENT,
        vocal_refine_enabled=VOCAL_REFINE_ENABLED,
        vocal_refine_model=VOCAL_REFINE_MODEL,
        guitar_refine_enabled=GUITAR_REFINE_ENABLED,
        guitar_refine_model=GUITAR_REFINE_MODEL,
        separator_bin_exists=Path(SEPARATOR_BIN).exists(),
        separator_use_autocast=SEPARATOR_USE_AUTOCAST,
        pipeline_version=PIPELINE_VERSION,
        download_timeout_seconds=DOWNLOAD_TIMEOUT_SECONDS,
        ffmpeg_timeout_seconds=FFMPEG_TIMEOUT_SECONDS,
        demucs_timeout_seconds=DEMUCS_TIMEOUT_SECONDS,
        upload_timeout_seconds=UPLOAD_TIMEOUT_SECONDS,
        analyze_timeout_seconds=ANALYZE_TIMEOUT_SECONDS,
        lyrics_timeout_seconds=LYRICS_TIMEOUT_SECONDS,
        ytdlp_cookies_from_browser=YTDLP_COOKIES_FROM_BROWSER or None,
        warmup_enabled=WORKER_WARMUP_ENABLED,
    )

    await asyncio.gather(
        asyncio.to_thread(ensure_worker_status_table),
        asyncio.to_thread(ensure_stem_layers_table),
        asyncio.to_thread(ensure_chord_verifications_table),
    )
    await asyncio.to_thread(update_worker_status, WORKER_ID, "starting")

    if WORKER_WARMUP_ENABLED:
        await warmup_models()

    for slot in range(WORKER_CONCURRENCY):
        task = asyncio.create_task(worker_loop(slot))
        WORKER_TASKS.append(task)

    REQUEUE_TASK = asyncio.create_task(stale_requeue_loop())
    WORKER_STATUS_TASK = asyncio.create_task(worker_status_loop())
    WORKER_COMMAND_TASK = asyncio.create_task(worker_command_loop())
    await asyncio.to_thread(update_worker_status, WORKER_ID, "idle")


@app.on_event("shutdown")
async def shutdown_workers():
    for task in WORKER_TASKS:
        task.cancel()

    if WORKER_TASKS:
        await asyncio.gather(*WORKER_TASKS, return_exceptions=True)

    if REQUEUE_TASK:
        REQUEUE_TASK.cancel()
        await asyncio.gather(REQUEUE_TASK, return_exceptions=True)

    if WORKER_STATUS_TASK:
        WORKER_STATUS_TASK.cancel()
        await asyncio.gather(WORKER_STATUS_TASK, return_exceptions=True)

    if WORKER_COMMAND_TASK:
        WORKER_COMMAND_TASK.cancel()
        await asyncio.gather(WORKER_COMMAND_TASK, return_exceptions=True)

    try:
        await asyncio.to_thread(update_worker_status, WORKER_ID, "stopped")
    except Exception as exc:
        log_event("worker.status_update_error", worker_id=WORKER_ID, error=str(exc))


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "worker_id": WORKER_ID,
        "concurrency": WORKER_CONCURRENCY,
        "poll_interval_seconds": QUEUE_POLL_INTERVAL_SECONDS,
        "demucs_device": DEMUCS_DEVICE,
        "demucs_jobs": DEMUCS_JOBS,
    }


# Backward-compatible manual enqueue endpoint (not used by app primary flow).
@app.post("/process", dependencies=[Depends(verify_token)])
async def process_song(req: ProcessRequest):
    db = get_turso_client()

    song = db.query_one(
        "SELECT id, user_id FROM songs WHERE id = ?",
        [req.song_id],
    )
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    existing = db.query_one(
        "SELECT id FROM processing_jobs WHERE song_id = ?",
        [req.song_id],
    )
    if existing:
        db.execute(
            """UPDATE processing_jobs
               SET status = 'queued',
                   run_after = unixepoch(),
                   last_error = NULL,
                   error_code = NULL,
                   locked_by = NULL,
                   locked_at = NULL,
                   heartbeat_at = NULL,
                   updated_at = unixepoch()
               WHERE song_id = ?""",
            [req.song_id],
        )
    else:
        db.execute(
            """INSERT INTO processing_jobs
               (id, song_id, user_id, youtube_url, status)
               VALUES (?, ?, ?, ?, 'queued')""",
            [new_id(), req.song_id, song.get("user_id"), req.youtube_url],
        )

    update_song(
        req.song_id,
        status="queued",
        processing_stage="queued",
        last_error=None,
    )

    return {"song_id": req.song_id, "status": "queued"}


@app.post("/api/reanalyze-chords/{song_id}", dependencies=[Depends(verify_token)])
async def reanalyze_chords_endpoint(song_id: str):
    """Re-run BTC chord detection for one song and replace its chord rows."""
    started = perf_counter()
    log_event("reanalyze.start", song_id=song_id)
    try:
        result = await asyncio.to_thread(reanalyze_chords_for_song, song_id)
    except SongNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except AudioNotFound as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        log_event(
            "reanalyze.failed",
            song_id=song_id,
            error=str(exc),
            traceback=traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail=f"reanalyze_failed: {exc}")

    duration_ms = int((perf_counter() - started) * 1000)
    log_event("reanalyze.done", song_id=song_id, duration_ms=duration_ms, **result)
    return {**result, "duration_ms": duration_ms}


@app.get("/status/{song_id}")
async def get_status(song_id: str):
    db = get_turso_client()
    row = db.query_one(
        """SELECT id, status, processing_stage, last_error, updated_at
           FROM songs WHERE id = ?""",
        [song_id],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Song not found")
    return row


async def worker_loop(slot: int):
    worker_name = f"{WORKER_ID}:{slot}"

    while True:
        try:
            job = await asyncio.to_thread(claim_next_job, worker_name)
            if not job:
                await asyncio.sleep(QUEUE_POLL_INTERVAL_SECONDS)
                continue

            await process_claimed_job(worker_name, job)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log_event("worker.loop_error", worker_id=worker_name, error=str(exc))
            await asyncio.sleep(QUEUE_POLL_INTERVAL_SECONDS)


async def stale_requeue_loop():
    interval = max(10.0, HEARTBEAT_INTERVAL_SECONDS)

    while True:
        try:
            jobs = await asyncio.to_thread(requeue_stale_jobs, HEARTBEAT_TIMEOUT_SECONDS)

            for job in jobs:
                song_id = job["song_id"]
                if job["status"] == "failed":
                    update_song(
                        song_id,
                        status="failed",
                        processing_stage="failed",
                        last_error=job.get("last_error") or "Processing failed",
                    )
                else:
                    update_song(
                        song_id,
                        status="queued",
                        processing_stage="queued",
                        last_error=job.get("last_error") or "Processing retried after worker timeout",
                    )

            if jobs:
                log_event("worker.requeue_stale", recovered_jobs=len(jobs))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log_event("worker.requeue_error", error=str(exc))

        await asyncio.sleep(interval)


async def worker_status_loop():
    while True:
        try:
            await asyncio.to_thread(touch_worker_status, WORKER_ID)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log_event("worker.status_update_error", worker_id=WORKER_ID, error=str(exc))

        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)


async def worker_command_loop():
    while True:
        try:
            command = await asyncio.to_thread(claim_worker_command, WORKER_ID)
            if command and command.get("command") == "restart":
                command_id = command["id"]
                log_event("worker.command_restart", worker_id=WORKER_ID, command_id=command_id)
                await asyncio.to_thread(
                    complete_worker_command,
                    command_id,
                    WORKER_ID,
                    "Restart acknowledged by worker",
                )
                os._exit(75)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log_event("worker.command_error", worker_id=WORKER_ID, error=str(exc))

        await asyncio.sleep(WORKER_COMMAND_INTERVAL_SECONDS)


async def process_claimed_job(worker_name: str, job: dict):
    db = get_turso_client()
    job_id = job["id"]
    song_id = job["song_id"]
    youtube_url = job["youtube_url"]
    attempt_count = job.get("attempt_count") or 1
    max_attempts = job.get("max_attempts") or 3
    started = datetime.now(timezone.utc)
    claim_delay_ms = None
    try:
        created_at = job.get("created_at")
        locked_at = job.get("locked_at")
        if created_at and locked_at:
            claim_delay_ms = int((int(locked_at) - int(created_at)) * 1000)
    except Exception:
        claim_delay_ms = None

    log_event(
        "job.claimed",
        worker_id=worker_name,
        job_id=job_id,
        song_id=song_id,
        attempt_count=attempt_count,
        max_attempts=max_attempts,
        claim_delay_ms=claim_delay_ms,
    )

    heartbeat_task = asyncio.create_task(heartbeat_loop(job_id, worker_name))
    pipeline_task: asyncio.Task | None = None
    await asyncio.to_thread(
        update_worker_status,
        WORKER_ID,
        "running",
        current_job_id=job_id,
        current_song_id=song_id,
    )

    try:
        update_song(song_id, status="processing", processing_stage="download", last_error=None)
        pipeline_task = asyncio.create_task(
            asyncio.wait_for(
                process_pipeline(job_id, song_id, youtube_url),
                timeout=JOB_TIMEOUT_SECONDS,
            )
        )
        done, _pending = await asyncio.wait(
            {pipeline_task, heartbeat_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if heartbeat_task in done:
            pipeline_task.cancel()
            await asyncio.gather(pipeline_task, return_exceptions=True)
            heartbeat_error = heartbeat_task.exception()
            if heartbeat_error:
                raise heartbeat_error
            raise JobCancelled(f"Job {job_id} lost its processing lease")

        await pipeline_task
        assert_job_active(db, job_id, song_id)

        db.execute(
            """UPDATE processing_jobs
               SET status = 'succeeded',
                   locked_by = NULL,
                   locked_at = NULL,
                   heartbeat_at = NULL,
                   error_code = NULL,
                   last_error = NULL,
                   finished_at = unixepoch(),
                   updated_at = unixepoch()
               WHERE id = ?""",
            [job_id],
        )

        update_song(
            song_id,
            status="ready",
            processing_stage="complete",
            last_error=None,
        )

        duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        log_event(
            "job.succeeded",
            worker_id=worker_name,
            job_id=job_id,
            song_id=song_id,
            duration_ms=duration_ms,
        )
    except JobCancelled as exc:
        log_event(
            "job.cancelled",
            worker_id=worker_name,
            job_id=job_id,
            song_id=song_id,
            reason=str(exc),
        )
    except Exception as exc:
        error_text = str(exc)
        error_code = classify_error(exc)

        retryable = attempt_count < max_attempts
        backoff_seconds = min(
            MAX_BACKOFF_SECONDS,
            max(15, (2 ** min(attempt_count, 8)) * 5),
        )

        if retryable:
            db.execute(
                """UPDATE processing_jobs
                   SET status = 'retryable',
                       run_after = unixepoch() + ?,
                       locked_by = NULL,
                       locked_at = NULL,
                       heartbeat_at = NULL,
                       last_error = ?,
                       error_code = ?,
                       updated_at = unixepoch()
                   WHERE id = ?""",
                [backoff_seconds, error_text, error_code, job_id],
            )
            update_song(
                song_id,
                status="queued",
                processing_stage="queued",
                last_error=error_text,
            )
        else:
            db.execute(
                """UPDATE processing_jobs
                   SET status = 'failed',
                       locked_by = NULL,
                       locked_at = NULL,
                       heartbeat_at = NULL,
                       last_error = ?,
                       error_code = ?,
                       finished_at = unixepoch(),
                       updated_at = unixepoch()
                   WHERE id = ?""",
                [error_text, error_code, job_id],
            )
            update_song(
                song_id,
                status="failed",
                processing_stage="failed",
                last_error=error_text,
            )

        duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        log_event(
            "job.failed",
            worker_id=worker_name,
            job_id=job_id,
            song_id=song_id,
            retryable=retryable,
            attempt_count=attempt_count,
            max_attempts=max_attempts,
            backoff_seconds=backoff_seconds if retryable else None,
            error=error_text,
            error_code=error_code,
            duration_ms=duration_ms,
            traceback=traceback.format_exc(),
        )
    finally:
        if pipeline_task and not pipeline_task.done():
            pipeline_task.cancel()
            await asyncio.gather(pipeline_task, return_exceptions=True)
        heartbeat_task.cancel()
        await asyncio.gather(heartbeat_task, return_exceptions=True)
        await asyncio.to_thread(update_worker_status, WORKER_ID, "idle")


async def heartbeat_loop(job_id: str, worker_name: str):
    db = get_turso_client()
    while True:
        try:
            rows = db.execute(
                """UPDATE processing_jobs
                   SET heartbeat_at = unixepoch(),
                       updated_at = unixepoch()
                   WHERE id = ? AND status = 'running' AND locked_by = ?
                   RETURNING id""",
                [job_id, worker_name],
            )
            if not rows:
                raise JobCancelled(f"Job {job_id} was deleted or superseded")
        except JobCancelled:
            raise
        except Exception as exc:
            log_event("job.heartbeat_error", job_id=job_id, worker_id=worker_name, error=str(exc))

        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)


def update_song(
    song_id: str,
    *,
    status: str,
    processing_stage: str,
    last_error: str | None,
):
    db = get_turso_client()
    db.execute(
        """UPDATE songs
           SET status = ?, processing_stage = ?, last_error = ?, updated_at = unixepoch()
           WHERE id = ?""",
        [status, processing_stage, last_error, song_id],
    )


async def run_cmd(
    cmd: list[str],
    label: str,
    song_id: str,
    job_id: str,
    timeout_seconds: int | None = None,
):
    log_event("pipeline.command_start", job_id=job_id, song_id=song_id, label=label, cmd=" ".join(cmd))
    started = datetime.now(timezone.utc)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        if timeout_seconds:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout_seconds,
            )
        else:
            stdout, stderr = await proc.communicate()
    except asyncio.TimeoutError:
        proc.kill()
        stdout, stderr = await proc.communicate()
        duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        log_event(
            "pipeline.command_timeout",
            job_id=job_id,
            song_id=song_id,
            label=label,
            duration_ms=duration_ms,
            timeout_seconds=timeout_seconds,
            stderr=stderr.decode(errors="ignore")[:1000],
        )
        raise RuntimeError(f"{label} timed out after {timeout_seconds}s")
    except asyncio.CancelledError:
        proc.kill()
        await proc.communicate()
        raise

    duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)

    if proc.returncode != 0:
        stderr_str = stderr.decode(errors="ignore")
        log_event(
            "pipeline.command_failed",
            job_id=job_id,
            song_id=song_id,
            label=label,
            duration_ms=duration_ms,
            return_code=proc.returncode,
            stderr=stderr_str[:1000],
        )
        raise RuntimeError(f"{label} failed (exit {proc.returncode})")

    log_event(
        "pipeline.command_done",
        job_id=job_id,
        song_id=song_id,
        label=label,
        duration_ms=duration_ms,
    )

    return stdout, stderr


async def run_stage_with_timeout(
    awaitable,
    *,
    timeout_seconds: int,
    label: str,
    song_id: str,
    job_id: str,
):
    try:
        return await asyncio.wait_for(awaitable, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        log_event(
            "pipeline.stage_timeout",
            job_id=job_id,
            song_id=song_id,
            label=label,
            timeout_seconds=timeout_seconds,
        )
        raise RuntimeError(f"{label} timed out after {timeout_seconds}s")


async def warmup_models():
    warmup_song_id = "__warmup__"
    warmup_job_id = "__warmup__"
    warmup_started = perf_counter()
    log_event("worker.warmup_start", worker_id=WORKER_ID)

    temp_dir = Path(tempfile.mkdtemp(prefix="mojo-warmup-"))
    warmup_audio = temp_dir / "warmup.wav"
    demucs_out = temp_dir / "separated"

    try:
        # Demucs needs ≥5.85s of stereo audio with non-zero signal (silence
        # trips an assertion in htdemucs's pad1d during normalization).
        with wave.open(str(warmup_audio), "w") as wav_file:
            wav_file.setnchannels(2)
            wav_file.setsampwidth(2)
            wav_file.setframerate(44100)
            sr = 44100
            duration_s = 8
            t = np.linspace(0, duration_s, sr * duration_s, endpoint=False, dtype=np.float32)
            tone = (3000 * np.sin(2 * np.pi * 440 * t)).astype(np.int16)
            wav_file.writeframes(np.column_stack([tone, tone]).flatten().tobytes())

        await run_demucs(
            audio_path=warmup_audio,
            demucs_out=demucs_out,
            song_id=warmup_song_id,
            job_id=warmup_job_id,
        )

        log_event(
            "worker.warmup_done",
            worker_id=WORKER_ID,
            duration_ms=int((perf_counter() - warmup_started) * 1000),
        )
    except Exception as exc:
        log_event(
            "worker.warmup_failed",
            worker_id=WORKER_ID,
            error=str(exc),
            duration_ms=int((perf_counter() - warmup_started) * 1000),
        )
    finally:
        for path in sorted(temp_dir.rglob("*"), reverse=True):
            try:
                if path.is_file():
                    path.unlink()
                elif path.is_dir():
                    path.rmdir()
            except Exception:
                continue
        try:
            temp_dir.rmdir()
        except Exception:
            pass


def extract_title_artist(work_dir: Path) -> tuple[str, str | None]:
    info_path = work_dir / "original.info.json"
    title = "Unknown Title"
    artist = None

    if info_path.exists():
        try:
            with open(info_path, "r", encoding="utf-8") as f:
                info = json.load(f)
            title = (info.get("title") or "Unknown Title").strip()
            artist = (info.get("uploader") or info.get("channel") or None)
            if isinstance(artist, str):
                artist = artist.strip()
                if artist == "":
                    artist = None
        except Exception:
            pass

    if " - " in title:
        left, right = (part.strip() for part in title.split(" - ", 1))
        normalized_artist = "".join((artist or "").casefold().split())
        normalized_left = "".join(left.casefold().split())
        normalized_right = "".join(right.casefold().split())

        # YouTube titles commonly use both "Artist - Song" and "Song - Artist".
        # The uploader is the best free signal for deciding which side is which.
        if normalized_artist and normalized_right == normalized_artist:
            title = left or title
        elif normalized_artist and normalized_left == normalized_artist:
            title = right or title
        else:
            title = right or title
            if left and not artist:
                artist = left

    return title, artist


def preserve_vocal_coverage(
    clean_path: Path,
    broad_path: Path,
    output_path: Path,
) -> int:
    """Use the clean vocal unless it drops a phrase retained by Demucs.

    RoFormer is cleaner, while Demucs is deliberately broader. A smoothed
    second-by-second crossfade gives learners one full vocal layer without
    making the entire stem noisier. Returns the number of fallback windows.
    """
    clean, clean_sr = sf.read(clean_path, always_2d=True, dtype="float32")
    broad, broad_sr = sf.read(broad_path, always_2d=True, dtype="float32")
    if clean_sr != broad_sr:
        raise ValueError("vocal sources use different sample rates")

    length = min(len(clean), len(broad))
    channels = min(clean.shape[1], broad.shape[1])
    clean = clean[:length, :channels]
    broad = broad[:length, :channels]
    if length == 0:
        raise ValueError("empty vocal source")

    frame_size = max(1, clean_sr)
    clean_rms: list[float] = []
    broad_rms: list[float] = []
    for start in range(0, length, frame_size):
        end = min(length, start + frame_size)
        clean_rms.append(float(np.sqrt(np.mean(clean[start:end] ** 2) + 1e-12)))
        broad_rms.append(float(np.sqrt(np.mean(broad[start:end] ** 2) + 1e-12)))

    clean_energy = np.asarray(clean_rms)
    broad_energy = np.asarray(broad_rms)
    audible = broad_energy[broad_energy > 1e-5]
    broad_floor = float(np.percentile(audible, 25) * 0.35) if audible.size else 1e-4
    missing = (broad_energy > max(1e-4, broad_floor)) & (
        clean_energy < broad_energy * 0.38
    )

    # Smooth at frame resolution, then interpolate once across the samples.
    # This avoids a costly sample-by-sample convolution on long songs while
    # still crossfading cleanly into and out of the broader vocal stem.
    frame_weights = np.convolve(
        missing.astype(np.float32),
        np.asarray([0.15, 0.7, 0.15], dtype=np.float32),
        mode="same",
    )
    frame_centers = (np.arange(len(frame_weights), dtype=np.float32) + 0.5) * frame_size
    sample_weights = np.interp(
        np.arange(length, dtype=np.float32),
        frame_centers,
        frame_weights,
        left=float(frame_weights[0]),
        right=float(frame_weights[-1]),
    )
    sample_weights = np.clip(sample_weights, 0.0, 1.0)[:, None]

    combined = clean * (1.0 - sample_weights) + broad * sample_weights
    peak = float(np.max(np.abs(combined)))
    if peak > 0.99:
        combined *= 0.99 / peak
    sf.write(output_path, combined, clean_sr, subtype="PCM_24")
    return int(missing.sum())


async def run_demucs(audio_path: Path, demucs_out: Path, song_id: str, job_id: str):
    base_cmd = [
        DEMUCS_PYTHON,
        "-m",
        "demucs",
        "-n",
        DEMUCS_MODEL,
        "-o",
        str(demucs_out),
        "-j",
        str(DEMUCS_JOBS),
        "--shifts",
        str(DEMUCS_SHIFTS),
    ]
    if DEMUCS_SEGMENT:
        base_cmd.extend(["--segment", DEMUCS_SEGMENT])

    preferred_device = DEMUCS_DEVICE
    cmd = base_cmd + ["-d", preferred_device, str(audio_path)]
    try:
        await run_cmd(
            cmd,
            f"demucs ({preferred_device})",
            song_id,
            job_id,
            timeout_seconds=DEMUCS_TIMEOUT_SECONDS,
        )
        return
    except Exception as exc:
        if preferred_device == "cpu":
            raise
        log_event(
            "demucs.device_fallback",
            song_id=song_id,
            job_id=job_id,
            from_device=preferred_device,
            to_device="cpu",
            error=str(exc),
        )

    fallback_cmd = base_cmd + ["-d", "cpu", str(audio_path)]
    await run_cmd(
        fallback_cmd,
        "demucs (cpu fallback)",
        song_id,
        job_id,
        timeout_seconds=DEMUCS_TIMEOUT_SECONDS,
    )


async def refine_stem(
    *,
    audio_path: Path,
    stems_dir: Path,
    work_dir: Path,
    song_id: str,
    job_id: str,
    model: str,
    stem_label: str,
    target_filename: str,
    checkpoint: PipelineCheckpoint,
    checkpoint_stage: str,
    single_stem: bool = False,
    required_labels: tuple[str, ...] = (),
) -> Path:
    """Replace one Demucs stem with a checkpointed Roformer separation.

    Best-effort: any failure leaves the Demucs stem in place.
    """
    refine_dir = work_dir / f"refined-{stem_label.lower()}"
    cached_outputs = sorted(refine_dir.glob(f"*({stem_label})*.wav"))
    cached_required = all(
        any(valid_wav(path) for path in refine_dir.glob(f"*({label})*.wav"))
        for label in required_labels
    )
    if (
        checkpoint.compute_done(checkpoint_stage)
        and cached_outputs
        and valid_wav(cached_outputs[0])
        and cached_required
    ):
        shutil.copyfile(cached_outputs[0], stems_dir / target_filename)
        log_event(
            "pipeline.checkpoint_reused",
            song_id=song_id,
            job_id=job_id,
            stage=checkpoint_stage,
        )
        return cached_outputs[0]

    if refine_dir.exists():
        shutil.rmtree(refine_dir)
    refine_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        SEPARATOR_BIN,
        str(audio_path),
        "-m",
        model,
        "--output_dir",
        str(refine_dir),
        "--output_format",
        "WAV",
        "--model_file_dir",
        SEPARATOR_MODEL_DIR,
    ]
    if SEPARATOR_USE_AUTOCAST:
        cmd.append("--use_autocast")
    if single_stem:
        cmd.extend(["--single_stem", stem_label])
    await run_cmd(
        cmd,
        f"{stem_label.lower()} refine (roformer)",
        song_id,
        job_id,
        timeout_seconds=VOCAL_REFINE_TIMEOUT_SECONDS,
    )
    outputs = sorted(refine_dir.glob(f"*({stem_label})*.wav"))
    if not outputs or not valid_wav(outputs[0]):
        raise RuntimeError(f"no {stem_label} output in {refine_dir}")
    for required_label in required_labels:
        required_outputs = sorted(refine_dir.glob(f"*({required_label})*.wav"))
        if not required_outputs or not valid_wav(required_outputs[0]):
            raise RuntimeError(f"no {required_label} output in {refine_dir}")
    shutil.copyfile(outputs[0], stems_dir / target_filename)
    checkpoint.mark_compute(checkpoint_stage)
    return outputs[0]


def compress_wav_to_mp3(wav_path: Path) -> Path:
    mp3_path = wav_path.with_suffix(".mp3")
    if mp3_path.exists() and mp3_path.stat().st_mtime_ns >= wav_path.stat().st_mtime_ns:
        return mp3_path
    subprocess.run(
        # V0 (~245 kbps VBR) — isolated stems expose encoding artifacts far
        # more than a full mix, so don't go below this.
        ["ffmpeg", "-y", "-i", str(wav_path), "-q:a", "0", str(mp3_path)],
        check=True,
        capture_output=True,
        timeout=FFMPEG_TIMEOUT_SECONDS,
    )
    return mp3_path


def upload_file_sync(local_path: Path, blob_pathname: str) -> str:
    """Compress WAV → MP3 and upload to Vercel Blob, returning the public URL."""
    if local_path.suffix.lower() == ".wav":
        local_path = compress_wav_to_mp3(local_path)
        blob_pathname = blob_pathname.rsplit(".", 1)[0] + ".mp3"

    content_type = "audio/mpeg" if local_path.suffix.lower() == ".mp3" else "audio/wav"
    return blob_upload_file(local_path, blob_pathname, content_type)


def find_demucs_stems(demucs_out: Path) -> Path | None:
    for directory in sorted(demucs_out.rglob("*")):
        if directory.is_dir() and all(
            valid_wav(directory / f"{stem}.wav")
            for stem in ("vocals", "other", "drums", "bass")
        ):
            return directory
    return None


def assert_job_active(db, job_id: str, song_id: str) -> None:
    row = db.query_one(
        """SELECT pj.id
           FROM processing_jobs pj
           JOIN songs s ON s.id = pj.song_id
           WHERE pj.id = ? AND pj.song_id = ? AND pj.status = 'running'""",
        [job_id, song_id],
    )
    if not row:
        raise JobCancelled(f"Job {job_id} was deleted or superseded")


async def upload_targets(
    targets: list[tuple[str, Path, str]],
    *,
    song_id: str,
    job_id: str,
    label: str,
) -> dict[str, str]:
    async def upload_one(target: tuple[str, Path, str]) -> tuple[str, str]:
        key, local_path, blob_pathname = target
        url = await asyncio.to_thread(upload_file_sync, local_path, blob_pathname)
        return key, url

    uploaded_pairs = await run_stage_with_timeout(
        asyncio.gather(*(upload_one(target) for target in targets)),
        timeout_seconds=UPLOAD_TIMEOUT_SECONDS,
        label=label,
        song_id=song_id,
        job_id=job_id,
    )
    return {key: url for key, url in uploaded_pairs}


def upsert_stem_urls(db, song_id: str, urls: dict[str, str]) -> None:
    allowed = {"original_url", "guitar_url", "vocals_url", "drums_url", "bass_url"}
    if not urls or not set(urls).issubset(allowed):
        raise ValueError("Invalid stem URL update")

    if not db.query_one("SELECT id FROM songs WHERE id = ?", [song_id]):
        raise JobCancelled(f"Song {song_id} was deleted during processing")

    existing = db.query_one("SELECT id FROM stems WHERE song_id = ?", [song_id])
    if existing:
        columns = sorted(urls)
        assignments = ", ".join(f"{column} = ?" for column in columns)
        db.execute(
            f"UPDATE stems SET {assignments} WHERE song_id = ?",
            [*(urls[column] for column in columns), song_id],
        )
        return

    db.execute(
        """INSERT INTO stems
           (id, song_id, original_url, guitar_url, vocals_url, drums_url, bass_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [
            new_id(),
            song_id,
            urls.get("original_url"),
            urls.get("guitar_url"),
            urls.get("vocals_url"),
            urls.get("drums_url"),
            urls.get("bass_url"),
        ],
    )


def upsert_stem_layers(db, song_id: str, layers: list[dict]) -> None:
    """Publish an extensible, truthful inventory alongside legacy stem columns."""
    if not db.query_one("SELECT id FROM songs WHERE id = ?", [song_id]):
        raise JobCancelled(f"Song {song_id} was deleted during processing")

    statements = []
    for layer in layers:
        statements.append(
            (
                """INSERT INTO stem_layers
                     (id, song_id, layer_key, label, instrument, role, url,
                      source_model, quality_status, is_learnable, sort_order,
                      updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
                   ON CONFLICT(song_id, layer_key) DO UPDATE SET
                     label = excluded.label,
                     instrument = excluded.instrument,
                     role = excluded.role,
                     url = excluded.url,
                     source_model = excluded.source_model,
                     quality_status = excluded.quality_status,
                     is_learnable = excluded.is_learnable,
                     sort_order = excluded.sort_order,
                     updated_at = unixepoch()""",
                [
                    new_id(),
                    song_id,
                    layer["layer_key"],
                    layer["label"],
                    layer["instrument"],
                    layer.get("role", "all"),
                    layer["url"],
                    layer.get("source_model"),
                    layer.get("quality_status", "preview"),
                    1 if layer.get("is_learnable") else 0,
                    layer.get("sort_order", 0),
                ],
            )
        )
    if statements:
        db.execute_batch(statements)


async def process_pipeline(job_id: str, song_id: str, youtube_url: str):
    db = get_turso_client()
    work_dir = source_cache_dir(OUTPUT_DIR, youtube_url, PIPELINE_VERSION)
    work_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = PipelineCheckpoint(work_dir, PIPELINE_VERSION)
    audio_path = work_dir / "original.wav"

    # Stage: download
    assert_job_active(db, job_id, song_id)
    update_song(song_id, status="processing", processing_stage="download", last_error=None)
    download_started = stage_start(stage="download", song_id=song_id, job_id=job_id)
    if checkpoint.compute_done("download") and valid_wav(audio_path):
        log_event(
            "pipeline.checkpoint_reused",
            song_id=song_id,
            job_id=job_id,
            stage="download",
        )
    else:
        download_cmd = [
            YTDLP_BIN,
            "--remote-components",
            "ejs:github",
            "-x",
            "--audio-format",
            "wav",
            "--audio-quality",
            "0",
            "--write-info-json",
            "--force-overwrites",
            "-o",
            str(work_dir / "original.%(ext)s"),
            "--no-playlist",
            youtube_url,
        ]
        if YTDLP_COOKIES_FROM_BROWSER:
            download_cmd[1:1] = ["--cookies-from-browser", YTDLP_COOKIES_FROM_BROWSER]

        await run_cmd(
            download_cmd,
            "yt-dlp download",
            song_id,
            job_id,
            timeout_seconds=DOWNLOAD_TIMEOUT_SECONDS,
        )

        if not valid_wav(audio_path):
            for ext in ["webm", "m4a", "mp3", "opus", "ogg"]:
                candidate = work_dir / f"original.{ext}"
                if candidate.exists():
                    await run_cmd(
                        [
                            "ffmpeg",
                            "-i",
                            str(candidate),
                            "-ar",
                            "44100",
                            "-ac",
                            "2",
                            str(audio_path),
                            "-y",
                        ],
                        "ffmpeg convert",
                        song_id,
                        job_id,
                        timeout_seconds=FFMPEG_TIMEOUT_SECONDS,
                    )
                    break

        if not valid_wav(audio_path):
            raise RuntimeError("No valid audio file found after download")
        checkpoint.mark_compute("download")

    title, artist = extract_title_artist(work_dir)
    stage_done(stage="download", song_id=song_id, job_id=job_id, started=download_started)

    assert_job_active(db, job_id, song_id)
    if artist:
        db.execute(
            "UPDATE songs SET title = ?, artist = ?, updated_at = unixepoch() WHERE id = ?",
            [title, artist, song_id],
        )
    else:
        db.execute(
            "UPDATE songs SET title = ?, updated_at = unixepoch() WHERE id = ?",
            [title, song_id],
        )

    # Stage: separate
    update_song(song_id, status="processing", processing_stage="separate", last_error=None)
    separate_started = stage_start(stage="separate", song_id=song_id, job_id=job_id)
    demucs_out = work_dir / "separated"
    stems_dir = find_demucs_stems(demucs_out)
    if checkpoint.compute_done("separate") and stems_dir:
        log_event(
            "pipeline.checkpoint_reused",
            song_id=song_id,
            job_id=job_id,
            stage="separate",
        )
    else:
        if demucs_out.exists():
            shutil.rmtree(demucs_out)
        await run_demucs(
            audio_path=audio_path,
            demucs_out=demucs_out,
            song_id=song_id,
            job_id=job_id,
        )
        stems_dir = find_demucs_stems(demucs_out)
        if not stems_dir:
            raise RuntimeError("Demucs did not produce a complete set of stems")
        checkpoint.mark_compute("separate")
    stage_done(stage="separate", song_id=song_id, job_id=job_id, started=separate_started)

    assert stems_dir is not None
    assert_job_active(db, job_id, song_id)

    # Publish Demucs stems immediately so the player is usable while the
    # high-quality vocal and guitar passes continue in the background.
    update_song(song_id, status="processing", processing_stage="preview_upload", last_error=None)
    preview_started = stage_start(stage="preview_upload", song_id=song_id, job_id=job_id)
    preview_row = db.query_one(
        """SELECT original_url, guitar_url, vocals_url, drums_url, bass_url
           FROM stems WHERE song_id = ?""",
        [song_id],
    )
    if checkpoint.upload_done(song_id, "preview") and preview_row and all(preview_row.values()):
        log_event(
            "pipeline.checkpoint_reused",
            song_id=song_id,
            job_id=job_id,
            stage="preview_upload",
        )
    else:
        preview_urls = await upload_targets(
            [
                ("original_url", audio_path, f"stems/{song_id}/original.wav"),
                ("guitar_url", stems_dir / "other.wav", f"stems/{song_id}/preview/other.wav"),
                ("vocals_url", stems_dir / "vocals.wav", f"stems/{song_id}/preview/vocals.wav"),
                ("drums_url", stems_dir / "drums.wav", f"stems/{song_id}/drums.wav"),
                ("bass_url", stems_dir / "bass.wav", f"stems/{song_id}/bass.wav"),
            ],
            song_id=song_id,
            job_id=job_id,
            label="preview upload",
        )
        assert_job_active(db, job_id, song_id)
        upsert_stem_urls(db, song_id, preview_urls)
        upsert_stem_layers(
            db,
            song_id,
            [
                {
                    "layer_key": "full",
                    "label": "Full Song",
                    "instrument": "full",
                    "url": preview_urls["original_url"],
                    "source_model": "source",
                    "quality_status": "ready",
                    "sort_order": 4,
                },
                {
                    "layer_key": "vocals",
                    "label": "Vocals",
                    "instrument": "vocals",
                    "url": preview_urls["vocals_url"],
                    "source_model": DEMUCS_MODEL,
                    "quality_status": "preview",
                    "sort_order": 2,
                },
                {
                    "layer_key": "guitars",
                    "label": "All Guitars",
                    "instrument": "guitar",
                    "url": preview_urls["guitar_url"],
                    "source_model": DEMUCS_MODEL,
                    "quality_status": "preview",
                    "is_learnable": True,
                    "sort_order": 0,
                },
                {
                    "layer_key": "bass",
                    "label": "Bass",
                    "instrument": "bass",
                    "url": preview_urls["bass_url"],
                    "source_model": DEMUCS_MODEL,
                    "quality_status": "ready",
                    "is_learnable": True,
                    "sort_order": 1,
                },
                {
                    "layer_key": "drums",
                    "label": "Drums",
                    "instrument": "drums",
                    "url": preview_urls["drums_url"],
                    "source_model": DEMUCS_MODEL,
                    "quality_status": "ready",
                    "sort_order": 3,
                },
            ],
        )
        checkpoint.mark_upload(song_id, "preview")
    stage_done(
        stage="preview_upload",
        song_id=song_id,
        job_id=job_id,
        started=preview_started,
    )

    # Stage: refine. The guitar model consumes the vocal-free instrumental
    # created by the vocal model, preventing vocals from leaking into Guitar.
    if (VOCAL_REFINE_ENABLED or GUITAR_REFINE_ENABLED) and Path(SEPARATOR_BIN).exists():
        update_song(song_id, status="processing", processing_stage="refine", last_error=None)
        refine_started = stage_start(stage="refine", song_id=song_id, job_id=job_id)
        demucs_vocals_path = work_dir / "demucs-vocals.wav"
        if not valid_wav(demucs_vocals_path):
            shutil.copyfile(stems_dir / "vocals.wav", demucs_vocals_path)
        # When vocal refinement is enabled, Guitar must only see the
        # vocal-free instrumental. If that prerequisite fails, retain the
        # Demucs guitar/other preview instead of reintroducing vocal bleed by
        # running the guitar model against the full mix.
        guitar_input: Path | None = None if VOCAL_REFINE_ENABLED else audio_path
        if VOCAL_REFINE_ENABLED:
            try:
                refined_vocal_path = await refine_stem(
                    audio_path=audio_path,
                    stems_dir=stems_dir,
                    work_dir=work_dir,
                    song_id=song_id,
                    job_id=job_id,
                    model=VOCAL_REFINE_MODEL,
                    stem_label="Vocals",
                    target_filename="vocals.wav",
                    checkpoint=checkpoint,
                    checkpoint_stage="vocal_refine",
                    required_labels=("Instrumental",),
                )
                fallback_windows = await asyncio.to_thread(
                    preserve_vocal_coverage,
                    refined_vocal_path,
                    demucs_vocals_path,
                    stems_dir / "vocals.wav",
                )
                log_event(
                    "vocals.coverage_preserved",
                    song_id=song_id,
                    job_id=job_id,
                    fallback_windows=fallback_windows,
                )
                instrumental_outputs = sorted(
                    (work_dir / "refined-vocals").glob("*(Instrumental)*.wav")
                )
                if instrumental_outputs and valid_wav(instrumental_outputs[0]):
                    guitar_input = instrumental_outputs[0]
            except Exception as exc:
                log_event(
                    "refine.failed_fallback_to_demucs_stem",
                    song_id=song_id,
                    job_id=job_id,
                    stem="Vocals",
                    error=str(exc),
                )
        if GUITAR_REFINE_ENABLED and guitar_input is not None:
            try:
                await refine_stem(
                    audio_path=guitar_input,
                    stems_dir=stems_dir,
                    work_dir=work_dir,
                    song_id=song_id,
                    job_id=job_id,
                    model=GUITAR_REFINE_MODEL,
                    stem_label="Guitar",
                    target_filename="other.wav",
                    checkpoint=checkpoint,
                    checkpoint_stage="guitar_refine",
                    single_stem=True,
                )
            except Exception as exc:
                log_event(
                    "refine.failed_fallback_to_demucs_stem",
                    song_id=song_id,
                    job_id=job_id,
                    stem="Guitar",
                    error=str(exc),
                )
        elif GUITAR_REFINE_ENABLED:
            log_event(
                "refine.skipped_missing_vocal_free_input",
                song_id=song_id,
                job_id=job_id,
                stem="Guitar",
            )
        stage_done(stage="refine", song_id=song_id, job_id=job_id, started=refine_started)

    assert_job_active(db, job_id, song_id)

    # Publish only the refined stems. Original, drums and bass were already
    # uploaded once during preview publication.
    update_song(song_id, status="processing", processing_stage="upload", last_error=None)
    upload_started = stage_start(stage="upload", song_id=song_id, job_id=job_id)
    final_row = db.query_one(
        "SELECT guitar_url, vocals_url FROM stems WHERE song_id = ?",
        [song_id],
    )
    if (
        checkpoint.upload_done(song_id, "final")
        and final_row
        and all(final_row.values())
        and all("/preview/" not in str(value) for value in final_row.values())
    ):
        log_event(
            "pipeline.checkpoint_reused",
            song_id=song_id,
            job_id=job_id,
            stage="upload",
        )
    else:
        final_urls = await upload_targets(
            [
                ("guitar_url", stems_dir / "other.wav", f"stems/{song_id}/other.wav"),
                ("vocals_url", stems_dir / "vocals.wav", f"stems/{song_id}/vocals.wav"),
            ],
            song_id=song_id,
            job_id=job_id,
            label="final stem upload",
        )
        assert_job_active(db, job_id, song_id)
        upsert_stem_urls(db, song_id, final_urls)
        upsert_stem_layers(
            db,
            song_id,
            [
                {
                    "layer_key": "vocals",
                    "label": "Vocals",
                    "instrument": "vocals",
                    "url": final_urls["vocals_url"],
                    "source_model": (
                        VOCAL_REFINE_MODEL
                        if checkpoint.compute_done("vocal_refine")
                        else DEMUCS_MODEL
                    ),
                    "quality_status": "ready",
                    "sort_order": 2,
                },
                {
                    "layer_key": "guitars",
                    "label": "All Guitars",
                    "instrument": "guitar",
                    "url": final_urls["guitar_url"],
                    "source_model": (
                        GUITAR_REFINE_MODEL
                        if checkpoint.compute_done("guitar_refine")
                        else DEMUCS_MODEL
                    ),
                    "quality_status": "ready",
                    "is_learnable": True,
                    "sort_order": 0,
                },
            ],
        )
        checkpoint.mark_upload(song_id, "final")
    stage_done(stage="upload", song_id=song_id, job_id=job_id, started=upload_started)

    # Stage: transcribe (guitar stem → tab notes). Non-fatal — the song is
    # still fully usable without tabs.
    guitar_stem_path = stems_dir / "other.wav" if stems_dir else None
    if TAB_TRANSCRIBE_ENABLED and guitar_stem_path and guitar_stem_path.exists():
        update_song(song_id, status="processing", processing_stage="transcribe", last_error=None)
        transcribe_started = stage_start(stage="transcribe", song_id=song_id, job_id=job_id)
        try:
            tab_notes = await run_stage_with_timeout(
                asyncio.to_thread(transcribe_guitar_stem, str(guitar_stem_path)),
                timeout_seconds=TAB_TIMEOUT_SECONDS,
                label="tab transcription",
                song_id=song_id,
                job_id=job_id,
            )
            await asyncio.to_thread(write_tab_notes, db, song_id, tab_notes or [])
            log_event(
                "pipeline.tabs_detected",
                song_id=song_id,
                job_id=job_id,
                note_count=len(tab_notes or []),
            )
        except Exception as exc:
            log_event(
                "pipeline.tabs_failed",
                song_id=song_id,
                job_id=job_id,
                error=str(exc),
                traceback=traceback.format_exc(),
            )
        finally:
            stage_done(stage="transcribe", song_id=song_id, job_id=job_id, started=transcribe_started)

    # Stage: analyze (sections + chords) and lyrics in parallel.
    update_song(song_id, status="processing", processing_stage="analyze", last_error=None)
    analyze_started = stage_start(stage="analyze", song_id=song_id, job_id=job_id)
    lyrics_started = stage_start(stage="lyrics", song_id=song_id, job_id=job_id)
    with wave.open(str(audio_path), "r") as wav_file:
        duration = wav_file.getnframes() / wav_file.getframerate()
    lyrics_task = asyncio.create_task(
        asyncio.to_thread(fetch_lyrics, title, artist, duration)
    )
    analyze_stage_closed = False
    lyrics_stage_closed = False
    try:

        sections = await run_stage_with_timeout(
            asyncio.to_thread(detect_sections, str(audio_path), duration),
            timeout_seconds=ANALYZE_TIMEOUT_SECONDS,
            label="section detection",
            song_id=song_id,
            job_id=job_id,
        )
        db.execute("DELETE FROM sections WHERE song_id = ?", [song_id])
        for section in sections or []:
            db.execute(
                """INSERT INTO sections (id, song_id, label, start_time, end_time)
                   VALUES (?, ?, ?, ?, ?)""",
                [
                    new_id(),
                    song_id,
                    section["label"],
                    section["start"],
                    section["end"],
                ],
            )

        try:
            bass_stem_path = stems_dir / "bass.wav" if stems_dir else None
            chords, bpm = await run_stage_with_timeout(
                asyncio.to_thread(
                    detect_chords,
                    str(audio_path),
                    str(guitar_stem_path),
                    str(bass_stem_path) if bass_stem_path and bass_stem_path.exists() else None,
                ),
                timeout_seconds=ANALYZE_TIMEOUT_SECONDS,
                label="chord detection",
                song_id=song_id,
                job_id=job_id,
            )
            db.execute(
                "UPDATE songs SET bpm = ?, updated_at = unixepoch() WHERE id = ?",
                [bpm, song_id],
            )
            log_event("pipeline.bpm_detected", song_id=song_id, job_id=job_id, bpm=bpm)
            await asyncio.to_thread(write_chord_analysis, db, song_id, chords or [])
            log_event(
                "pipeline.chords_truth_gated",
                song_id=song_id,
                job_id=job_id,
                candidate_count=len(chords or []),
                verified_count=verified_count(chords or []),
                withheld_count=len(chords or []) - verified_count(chords or []),
                verified_coverage=verified_coverage(chords or []),
            )
        except Exception as exc:
            error_text = f"chord_detection_failed: {exc}"
            log_event(
                "pipeline.chords_failed",
                song_id=song_id,
                job_id=job_id,
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            db.execute(
                "UPDATE processing_jobs SET last_error = ?, updated_at = unixepoch() WHERE id = ?",
                [error_text, job_id],
            )
        finally:
            stage_done(stage="analyze", song_id=song_id, job_id=job_id, started=analyze_started)
            analyze_stage_closed = True

        update_song(song_id, status="processing", processing_stage="lyrics", last_error=None)
        try:
            lyrics = await run_stage_with_timeout(
                lyrics_task,
                timeout_seconds=LYRICS_TIMEOUT_SECONDS,
                label="lyrics",
                song_id=song_id,
                job_id=job_id,
            )
            if lyrics:
                existing_lyrics = db.query_one(
                    "SELECT id FROM lyrics WHERE song_id = ?", [song_id]
                )
                if existing_lyrics:
                    db.execute(
                        """UPDATE lyrics
                           SET synced_lrc = ?, plain_text = ?, source = ?
                           WHERE song_id = ?""",
                        [
                            lyrics["synced_lrc"],
                            lyrics["plain_text"],
                            lyrics["source"],
                            song_id,
                        ],
                    )
                else:
                    db.execute(
                        """INSERT INTO lyrics
                           (id, song_id, synced_lrc, plain_text, source)
                           VALUES (?, ?, ?, ?, ?)""",
                        [
                            new_id(),
                            song_id,
                            lyrics["synced_lrc"],
                            lyrics["plain_text"],
                            lyrics["source"],
                        ],
                    )
            else:
                db.execute("DELETE FROM lyrics WHERE song_id = ?", [song_id])
        except Exception as exc:
            log_event("pipeline.lyrics_non_fatal", song_id=song_id, job_id=job_id, error=str(exc))
        finally:
            stage_done(stage="lyrics", song_id=song_id, job_id=job_id, started=lyrics_started)
            lyrics_stage_closed = True
    finally:
        if not analyze_stage_closed:
            stage_done(stage="analyze", song_id=song_id, job_id=job_id, started=analyze_started)
        if not lyrics_stage_closed:
            stage_done(stage="lyrics", song_id=song_id, job_id=job_id, started=lyrics_started)
        if not lyrics_task.done():
            lyrics_task.cancel()
            await asyncio.gather(lyrics_task, return_exceptions=True)


def classify_error(exc: Exception) -> str:
    msg = str(exc).lower()
    if "timed out" in msg or isinstance(exc, asyncio.TimeoutError):
        return "timeout"
    if "yt-dlp" in msg:
        return "download_error"
    if "demucs" in msg:
        return "separation_error"
    if "ffmpeg" in msg:
        return "audio_conversion_error"
    if "upload" in msg or "storage" in msg or "blob" in msg:
        return "storage_error"
    return "pipeline_error"


def detect_chords(
    audio_path: str,
    guitar_audio_path: str,
    bass_audio_path: str | None = None,
) -> tuple[list[dict], float]:
    """
    Run chord recognition with the BTC (Bi-directional Transformer for Chord
    Recognition) model from BTC-ISMIR19, plus librosa beat tracking for BPM.

    BTC proposes labels from the full mix. The isolated guitar and bass then
    independently verify or withhold every proposal.
    """
    candidates = btc_predict_chords(audio_path)
    chords = verify_chord_candidates(
        candidates,
        guitar_audio_path=guitar_audio_path,
        bass_audio_path=bass_audio_path,
    )

    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    tempo_raw, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = round(float(np.atleast_1d(tempo_raw)[0]), 2)

    return chords, bpm


def fetch_lyrics(
    title: str,
    artist: str | None,
    duration: float | None = None,
) -> dict | None:
    """
    Fetch lyrics using a multi-source, multi-query fallback chain.

    Strategy (stops at first hit):
      1. LRCLIB synced LRC matched to the downloaded audio duration
      2. Synced LRC — Lrclib, Musixmatch, Deezer, NetEase
      3. Word-level sync — Musixmatch enhanced=True
      4. Synced LRC — all remaining providers
      5. Plain text — all providers

    Each tier is tried with up to 3 query variants:
      "{title} {artist}", "{artist} {title}", "{title}"
    """
    if duration and duration > 0:
        try:
            matched = fetch_duration_matched_lyrics(title, artist, duration)
            if matched:
                log_event(
                    "lyrics.found",
                    query=f"{title} {artist or ''}".strip(),
                    tier="lrclib_duration_matched",
                    duration=round(duration, 2),
                    source=matched["source"],
                )
                return matched
        except Exception as exc:
            log_event(
                "lyrics.provider_error",
                query=f"{title} {artist or ''}".strip(),
                providers=["LrclibDurationMatched"],
                error=str(exc),
            )

    queries: list[str] = []
    for q in [
        f"{title} {artist}" if artist else None,
        f"{artist} {title}" if artist else None,
        title,
    ]:
        if q and q not in queries:
            queries.append(q)

    def _try(query: str, *, providers: list[str] | None = None,
             synced_only: bool = False, plain_only: bool = False,
             enhanced: bool = False) -> str | None:
        kwargs: dict = {}
        if providers:
            kwargs["providers"] = providers
        if synced_only:
            kwargs["synced_only"] = True
        if plain_only:
            kwargs["plain_only"] = True
        if enhanced:
            kwargs["enhanced"] = True
        try:
            return syncedlyrics.search(query, **kwargs)
        except Exception as exc:
            log_event("lyrics.provider_error", query=query, providers=providers, error=str(exc))
            return None

    SYNCED_PRIORITY = ["Lrclib", "Musixmatch", "Deezer", "NetEase"]
    for q in queries:
        result = _try(q, providers=SYNCED_PRIORITY, synced_only=True)
        if result:
            log_event("lyrics.found", query=q, tier="synced_priority", enhanced=False)
            return {"synced_lrc": result, "plain_text": None, "source": "syncedlyrics/synced"}

    for q in queries:
        result = _try(q, providers=["Musixmatch"], synced_only=True, enhanced=True)
        if result:
            log_event("lyrics.found", query=q, tier="musixmatch_enhanced")
            return {"synced_lrc": result, "plain_text": None, "source": "syncedlyrics/musixmatch_enhanced"}

    for q in queries:
        result = _try(q, synced_only=True)
        if result:
            log_event("lyrics.found", query=q, tier="synced_all")
            return {"synced_lrc": result, "plain_text": None, "source": "syncedlyrics/synced_all"}

    for q in queries:
        result = _try(q, plain_only=True)
        if result:
            if result.strip().startswith("["):
                log_event("lyrics.found", query=q, tier="plain_as_lrc")
                return {"synced_lrc": result, "plain_text": None, "source": "syncedlyrics/plain_as_lrc"}
            log_event("lyrics.found", query=q, tier="plain")
            return {"synced_lrc": None, "plain_text": result, "source": "syncedlyrics/plain"}

    log_event("lyrics.not_found", title=title, artist=artist)
    return None


def detect_sections(audio_path: str, duration: float) -> list[dict]:
    """
    Detect song sections using librosa's structural segmentation (MFCC + recurrence matrix).
    Falls back to heuristic percentage-based markers if librosa analysis fails.
    """
    def heuristic_fallback() -> list[dict]:
        if duration < 60:
            return [{"label": "Full Song", "start": 0, "end": round(duration, 2)}]
        markers = [
            ("Intro", 0.0, 0.08),
            ("Verse I", 0.08, 0.28),
            ("Chorus", 0.28, 0.43),
            ("Verse II", 0.43, 0.63),
            ("Chorus", 0.63, 0.78),
            ("Bridge", 0.78, 0.88),
            ("Outro", 0.88, 1.0),
        ]
        return [
            {"label": label, "start": round(s * duration, 2), "end": round(e * duration, 2)}
            for label, s, e in markers
        ]

    try:
        y, sr = librosa.load(audio_path, sr=11025, mono=True)

        hop_length = 512
        mfcc = librosa.feature.mfcc(
            y=y, sr=sr, n_mfcc=13, hop_length=hop_length
        )
        chroma = librosa.feature.chroma_cqt(
            y=y, sr=sr, hop_length=hop_length
        )
        features = librosa.util.normalize(
            np.vstack([mfcc, chroma]), axis=1
        )

        # A direct feature-change curve is bounded in memory and cannot create
        # the invalid non-square lag matrix produced by the old diff filter.
        novelty_curve = np.linalg.norm(np.diff(features, axis=1), axis=0)

        kernel_size = max(3, int(sr * 4 / hop_length) | 1)
        novelty_smooth = np.convolve(novelty_curve, np.hanning(kernel_size), mode="same")

        threshold = novelty_smooth.mean() + 0.5 * novelty_smooth.std()
        frame_times = librosa.frames_to_time(
            np.arange(len(novelty_smooth)), sr=sr, hop_length=hop_length
        )
        min_gap_frames = int(sr * 20 / hop_length)

        boundaries = [0.0]
        last_peak = -min_gap_frames
        for i in range(1, len(novelty_smooth) - 1):
            if (
                novelty_smooth[i] > novelty_smooth[i - 1]
                and novelty_smooth[i] > novelty_smooth[i + 1]
                and novelty_smooth[i] > threshold
                and i - last_peak >= min_gap_frames
            ):
                boundaries.append(float(frame_times[i]))
                last_peak = i
        boundaries.append(float(duration))

        boundaries = sorted(set(round(b, 2) for b in boundaries))

        if len(boundaries) < 2:
            return heuristic_fallback()

        n = len(boundaries) - 1
        sections = []
        for i in range(n):
            pct = i / max(n - 1, 1)
            if i == 0:
                label = "Intro"
            elif i == n - 1:
                label = "Outro"
            elif pct < 0.35:
                label = f"Verse {i}"
            elif pct < 0.65:
                label = "Chorus"
            elif pct < 0.85:
                label = f"Verse {i}"
            else:
                label = "Bridge"
            sections.append({
                "label": label,
                "start": boundaries[i],
                "end": boundaries[i + 1],
            })

        return sections

    except Exception as exc:
        log_event("sections.librosa_failed", audio_path=audio_path, error=str(exc))
        return heuristic_fallback()
