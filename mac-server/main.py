"""
Mr. Mojo Rising — Mac FastAPI Server
Durable queue worker for YouTube download, stem separation, section/chord analysis,
and lyrics fetching.
"""

import asyncio
import json
import os
import subprocess
import tempfile
import traceback
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import perf_counter

import librosa
import numpy as np
import syncedlyrics
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client

from btc.inference import predict_chords as btc_predict_chords
from chord_reanalyze import (
    AudioNotFound,
    SongNotFound,
    reanalyze_chords as reanalyze_chords_for_song,
)

app = FastAPI(title="Mr. Mojo Rising — Mac Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Config
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
API_SECRET = os.environ.get("API_SECRET", "dev-secret")
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/tmp/mojo-stems"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

VENV_PYTHON = str(Path(__file__).resolve().parent / "venv" / "bin" / "python")
WORKER_ID = os.environ.get("WORKER_ID", f"mac-worker-{os.getpid()}")
WORKER_CONCURRENCY = max(1, int(os.environ.get("WORKER_CONCURRENCY", "1")))
QUEUE_POLL_INTERVAL_SECONDS = float(os.environ.get("QUEUE_POLL_INTERVAL_SECONDS", "0.5"))
HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get("JOB_HEARTBEAT_INTERVAL_SECONDS", "15"))
HEARTBEAT_TIMEOUT_SECONDS = int(os.environ.get("JOB_HEARTBEAT_TIMEOUT_SECONDS", "300"))
MAX_BACKOFF_SECONDS = int(os.environ.get("JOB_MAX_BACKOFF_SECONDS", "300"))
DEMUCS_PYTHON = os.environ.get("DEMUCS_PYTHON", VENV_PYTHON if Path(VENV_PYTHON).exists() else "python3.11")
DEMUCS_DEVICE = os.environ.get(
    "DEMUCS_DEVICE",
    "mps" if torch.backends.mps.is_built() and torch.backends.mps.is_available() else "cpu",
)
DEMUCS_JOBS = max(1, int(os.environ.get("DEMUCS_JOBS", "4")))
DEMUCS_SEGMENT = os.environ.get("DEMUCS_SEGMENT")
WORKER_WARMUP_ENABLED = os.environ.get("WORKER_WARMUP_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

WORKER_TASKS: list[asyncio.Task] = []
REQUEUE_TASK: asyncio.Task | None = None


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


def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


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
    global REQUEUE_TASK

    log_event(
        "worker.startup",
        worker_id=WORKER_ID,
        concurrency=WORKER_CONCURRENCY,
        poll_interval_seconds=QUEUE_POLL_INTERVAL_SECONDS,
        heartbeat_timeout_seconds=HEARTBEAT_TIMEOUT_SECONDS,
        demucs_python=DEMUCS_PYTHON,
        demucs_device=DEMUCS_DEVICE,
        demucs_jobs=DEMUCS_JOBS,
        demucs_segment=DEMUCS_SEGMENT,
        warmup_enabled=WORKER_WARMUP_ENABLED,
    )

    if WORKER_WARMUP_ENABLED:
        await warmup_models()

    for slot in range(WORKER_CONCURRENCY):
        task = asyncio.create_task(worker_loop(slot))
        WORKER_TASKS.append(task)

    REQUEUE_TASK = asyncio.create_task(stale_requeue_loop())


@app.on_event("shutdown")
async def shutdown_workers():
    for task in WORKER_TASKS:
        task.cancel()

    if WORKER_TASKS:
        await asyncio.gather(*WORKER_TASKS, return_exceptions=True)

    if REQUEUE_TASK:
        REQUEUE_TASK.cancel()
        await asyncio.gather(REQUEUE_TASK, return_exceptions=True)


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
    sb = get_supabase()

    song_result = (
        sb.table("songs")
        .select("id, user_id")
        .eq("id", req.song_id)
        .single()
        .execute()
    )
    song = song_result.data
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    sb.table("processing_jobs").upsert(
        {
            "song_id": req.song_id,
            "user_id": song["user_id"],
            "youtube_url": req.youtube_url,
            "status": "queued",
            "run_after": datetime.now(timezone.utc).isoformat(),
            "last_error": None,
            "error_code": None,
            "locked_by": None,
            "locked_at": None,
            "heartbeat_at": None,
        },
        on_conflict="song_id",
    ).execute()

    update_song(
        sb,
        req.song_id,
        status="queued",
        processing_stage="queued",
        last_error=None,
    )

    return {"song_id": req.song_id, "status": "queued"}


@app.post("/reanalyze-chords/{song_id}", dependencies=[Depends(verify_token)])
async def reanalyze_chords_endpoint(song_id: str):
    """Re-run BTC chord detection for one song and replace its chord rows."""
    sb = get_supabase()
    started = perf_counter()
    log_event("reanalyze.start", song_id=song_id)
    try:
        result = await asyncio.to_thread(reanalyze_chords_for_song, sb, song_id)
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
    sb = get_supabase()
    result = (
        sb.table("songs")
        .select("id, status, processing_stage, last_error, updated_at")
        .eq("id", song_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Song not found")
    return result.data


async def worker_loop(slot: int):
    worker_name = f"{WORKER_ID}:{slot}"
    sb = get_supabase()

    while True:
        try:
            claimed = sb.rpc("claim_next_job", {"worker_id": worker_name}).execute()
            jobs = claimed.data or []
            if not jobs:
                await asyncio.sleep(QUEUE_POLL_INTERVAL_SECONDS)
                continue

            job = jobs[0]
            await process_claimed_job(sb, worker_name, job)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log_event("worker.loop_error", worker_id=worker_name, error=str(exc))
            await asyncio.sleep(QUEUE_POLL_INTERVAL_SECONDS)


async def stale_requeue_loop():
    sb = get_supabase()
    interval = max(10.0, HEARTBEAT_INTERVAL_SECONDS)

    while True:
        try:
            recovered = sb.rpc(
                "requeue_stale_jobs",
                {"timeout_seconds": HEARTBEAT_TIMEOUT_SECONDS},
            ).execute()
            jobs = recovered.data or []

            for job in jobs:
                song_id = job["song_id"]
                if job["status"] == "failed":
                    update_song(
                        sb,
                        song_id,
                        status="failed",
                        processing_stage="failed",
                        last_error=job.get("last_error") or "Processing failed",
                    )
                else:
                    update_song(
                        sb,
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


async def process_claimed_job(sb: Client, worker_name: str, job: dict):
    job_id = job["id"]
    song_id = job["song_id"]
    youtube_url = job["youtube_url"]
    attempt_count = job.get("attempt_count", 1)
    max_attempts = job.get("max_attempts", 3)
    started = datetime.now(timezone.utc)
    claim_delay_ms = None
    try:
        created_at = datetime.fromisoformat((job.get("created_at") or "").replace("Z", "+00:00"))
        locked_at = datetime.fromisoformat((job.get("locked_at") or "").replace("Z", "+00:00"))
        claim_delay_ms = int((locked_at - created_at).total_seconds() * 1000)
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

    heartbeat_task = asyncio.create_task(heartbeat_loop(sb, job_id, worker_name))

    try:
        update_song(sb, song_id, status="processing", processing_stage="download", last_error=None)
        await process_pipeline(sb, job_id, song_id, youtube_url)

        sb.table("processing_jobs").update(
            {
                "status": "succeeded",
                "locked_by": None,
                "locked_at": None,
                "heartbeat_at": None,
                "error_code": None,
                "last_error": None,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()

        update_song(
            sb,
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
    except Exception as exc:
        error_text = str(exc)
        error_code = classify_error(exc)

        retryable = attempt_count < max_attempts
        backoff_seconds = min(
            MAX_BACKOFF_SECONDS,
            max(15, (2 ** min(attempt_count, 8)) * 5),
        )

        job_update: dict[str, object] = {
            "locked_by": None,
            "locked_at": None,
            "heartbeat_at": None,
            "last_error": error_text,
            "error_code": error_code,
        }

        if retryable:
            job_update.update(
                {
                    "status": "retryable",
                    "run_after": (datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)).isoformat(),
                }
            )
            update_song(
                sb,
                song_id,
                status="queued",
                processing_stage="queued",
                last_error=error_text,
            )
        else:
            job_update.update(
                {
                    "status": "failed",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            update_song(
                sb,
                song_id,
                status="failed",
                processing_stage="failed",
                last_error=error_text,
            )

        sb.table("processing_jobs").update(job_update).eq("id", job_id).execute()

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
        heartbeat_task.cancel()
        await asyncio.gather(heartbeat_task, return_exceptions=True)


async def heartbeat_loop(sb: Client, job_id: str, worker_name: str):
    while True:
        try:
            sb.table("processing_jobs").update(
                {
                    "heartbeat_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", job_id).eq("status", "running").eq("locked_by", worker_name).execute()
        except Exception as exc:
            log_event("job.heartbeat_error", job_id=job_id, worker_id=worker_name, error=str(exc))

        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)


def update_song(
    sb: Client,
    song_id: str,
    *,
    status: str,
    processing_stage: str,
    last_error: str | None,
):
    sb.table("songs").update(
        {
            "status": status,
            "processing_stage": processing_stage,
            "last_error": last_error,
        }
    ).eq("id", song_id).execute()


async def run_cmd(cmd: list[str], label: str, song_id: str, job_id: str):
    log_event("pipeline.command_start", job_id=job_id, song_id=song_id, label=label, cmd=" ".join(cmd))
    started = datetime.now(timezone.utc)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

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


async def warmup_models():
    warmup_song_id = "__warmup__"
    warmup_job_id = "__warmup__"
    warmup_started = perf_counter()
    log_event("worker.warmup_start", worker_id=WORKER_ID)

    temp_dir = Path(tempfile.mkdtemp(prefix="mojo-warmup-"))
    warmup_audio = temp_dir / "warmup.wav"
    demucs_out = temp_dir / "separated"

    try:
        with wave.open(str(warmup_audio), "w") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(44100)
            wav_file.writeframes((np.zeros(44100, dtype=np.int16)).tobytes())

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
        parts = title.split(" - ", 1)
        parsed_artist = parts[0].strip()
        parsed_title = parts[1].strip()
        if parsed_title:
            title = parsed_title
        if parsed_artist and not artist:
            artist = parsed_artist

    return title, artist


async def run_demucs(audio_path: Path, demucs_out: Path, song_id: str, job_id: str):
    base_cmd = [
        DEMUCS_PYTHON,
        "-m",
        "demucs",
        "-n",
        "htdemucs",
        "-o",
        str(demucs_out),
        "-j",
        str(DEMUCS_JOBS),
    ]
    if DEMUCS_SEGMENT:
        base_cmd.extend(["--segment", DEMUCS_SEGMENT])

    preferred_device = DEMUCS_DEVICE
    cmd = base_cmd + ["-d", preferred_device, str(audio_path)]
    try:
        await run_cmd(cmd, f"demucs ({preferred_device})", song_id, job_id)
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
    await run_cmd(fallback_cmd, "demucs (cpu fallback)", song_id, job_id)


def compress_wav_to_mp3(wav_path: Path) -> Path:
    mp3_path = wav_path.with_suffix(".mp3")
    if mp3_path.exists():
        return mp3_path
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), "-q:a", "2", str(mp3_path)],
        check=True,
        capture_output=True,
    )
    return mp3_path


def upload_file_sync(local_path: Path, storage_path: str) -> str:
    # Compress WAV to MP3 to stay under Supabase's storage size limit.
    if local_path.suffix.lower() == ".wav":
        local_path = compress_wav_to_mp3(local_path)
        storage_path = storage_path.rsplit(".", 1)[0] + ".mp3"

    local_sb = get_supabase()
    content_type = "audio/mpeg" if local_path.suffix.lower() == ".mp3" else "audio/wav"
    with open(local_path, "rb") as f:
        data = f.read()

    try:
        local_sb.storage.from_("stems").upload(
            storage_path,
            data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception:
        local_sb.storage.from_("stems").remove([storage_path])
        local_sb.storage.from_("stems").upload(
            storage_path,
            data,
            file_options={"content-type": content_type, "upsert": "true"},
        )

    return local_sb.storage.from_("stems").get_public_url(storage_path)


async def process_pipeline(sb: Client, job_id: str, song_id: str, youtube_url: str):
    work_dir = OUTPUT_DIR / song_id
    work_dir.mkdir(parents=True, exist_ok=True)

    # Stage: download
    update_song(sb, song_id, status="processing", processing_stage="download", last_error=None)
    download_started = stage_start(stage="download", song_id=song_id, job_id=job_id)
    await run_cmd(
        [
            "yt-dlp",
            "-x",
            "--audio-format",
            "wav",
            "--audio-quality",
            "0",
            "--write-info-json",
            "-o",
            str(work_dir / "original.%(ext)s"),
            "--no-playlist",
            youtube_url,
        ],
        "yt-dlp download",
        song_id,
        job_id,
    )

    audio_path = work_dir / "original.wav"
    if not audio_path.exists():
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
                )
                break

    if not audio_path.exists():
        raise RuntimeError("No audio file found after download")

    title, artist = extract_title_artist(work_dir)
    stage_done(stage="download", song_id=song_id, job_id=job_id, started=download_started)

    sb.table("songs").update(
        {
            "title": title,
            **({"artist": artist} if artist else {}),
        }
    ).eq("id", song_id).execute()

    # Stage: separate
    update_song(sb, song_id, status="processing", processing_stage="separate", last_error=None)
    separate_started = stage_start(stage="separate", song_id=song_id, job_id=job_id)
    demucs_out = work_dir / "separated"
    await run_demucs(audio_path=audio_path, demucs_out=demucs_out, song_id=song_id, job_id=job_id)
    stage_done(stage="separate", song_id=song_id, job_id=job_id, started=separate_started)

    stems_dir = None
    for directory in sorted(demucs_out.rglob("*")):
        if directory.is_dir() and (directory / "vocals.wav").exists():
            stems_dir = directory
            break

    # Stage: upload (idempotent upserts)
    update_song(sb, song_id, status="processing", processing_stage="upload", last_error=None)
    upload_started = stage_start(stage="upload", song_id=song_id, job_id=job_id)

    upload_targets: list[tuple[str, Path, str]] = [
        ("original_url", audio_path, f"{song_id}/original.wav"),
    ]

    if stems_dir:
        stem_map = {
            "other": "guitar_url",
            "vocals": "vocals_url",
            "drums": "drums_url",
            "bass": "bass_url",
        }
        for stem_name, url_key in stem_map.items():
            stem_file = stems_dir / f"{stem_name}.wav"
            if stem_file.exists():
                upload_targets.append((url_key, stem_file, f"{song_id}/{stem_name}.wav"))

    async def upload_one(target: tuple[str, Path, str]) -> tuple[str, str]:
        key, local_path, storage_path = target
        url = await asyncio.to_thread(upload_file_sync, local_path, storage_path)
        return key, url

    uploaded_pairs = await asyncio.gather(*(upload_one(target) for target in upload_targets))
    uploaded_urls = {key: url for key, url in uploaded_pairs}

    sb.table("stems").upsert(
        {
            "song_id": song_id,
            "original_url": uploaded_urls.get("original_url"),
            "guitar_url": uploaded_urls.get("guitar_url"),
            "vocals_url": uploaded_urls.get("vocals_url"),
            "drums_url": uploaded_urls.get("drums_url"),
            "bass_url": uploaded_urls.get("bass_url"),
        },
        on_conflict="song_id",
    ).execute()
    stage_done(stage="upload", song_id=song_id, job_id=job_id, started=upload_started)

    # Stage: analyze (sections + chords) and lyrics in parallel.
    update_song(sb, song_id, status="processing", processing_stage="analyze", last_error=None)
    analyze_started = stage_start(stage="analyze", song_id=song_id, job_id=job_id)
    lyrics_started = stage_start(stage="lyrics", song_id=song_id, job_id=job_id)
    lyrics_task = asyncio.create_task(asyncio.to_thread(fetch_lyrics, title, artist))
    analyze_stage_closed = False
    lyrics_stage_closed = False
    try:
        with wave.open(str(audio_path), "r") as wav_file:
            duration = wav_file.getnframes() / wav_file.getframerate()

        sections = await asyncio.to_thread(detect_sections, str(audio_path), duration)
        sb.table("sections").delete().eq("song_id", song_id).execute()
        if sections:
            sb.table("sections").insert(
                [
                    {
                        "song_id": song_id,
                        "label": section["label"],
                        "start_time": section["start"],
                        "end_time": section["end"],
                    }
                    for section in sections
                ]
            ).execute()

        try:
            chords, bpm = await asyncio.to_thread(detect_chords, str(audio_path))
            # Store BPM on the song record.
            sb.table("songs").update({"bpm": bpm}).eq("id", song_id).execute()
            log_event("pipeline.bpm_detected", song_id=song_id, job_id=job_id, bpm=bpm)
            sb.table("chords").delete().eq("song_id", song_id).execute()
            if chords:
                sb.table("chords").insert(
                    [
                        {
                            "song_id": song_id,
                            "start_time": chord["start"],
                            "end_time": chord["end"],
                            "chord_label": chord["label"],
                            "chord_standard": chord["standard"],
                            "confidence": chord["confidence"],
                        }
                        for chord in chords
                    ]
                ).execute()
        except Exception as exc:
            error_text = f"chord_detection_failed: {exc}"
            log_event(
                "pipeline.chords_failed",
                song_id=song_id,
                job_id=job_id,
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            sb.table("processing_jobs").update({"last_error": error_text}).eq(
                "id", job_id
            ).execute()
        finally:
            stage_done(stage="analyze", song_id=song_id, job_id=job_id, started=analyze_started)
            analyze_stage_closed = True

        update_song(sb, song_id, status="processing", processing_stage="lyrics", last_error=None)
        try:
            lyrics = await lyrics_task
            if lyrics:
                sb.table("lyrics").upsert(
                    {
                        "song_id": song_id,
                        "synced_lrc": lyrics["synced_lrc"],
                        "plain_text": lyrics["plain_text"],
                        "source": lyrics["source"],
                    },
                    on_conflict="song_id",
                ).execute()
            else:
                sb.table("lyrics").delete().eq("song_id", song_id).execute()
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
    if "yt-dlp" in msg:
        return "download_error"
    if "demucs" in msg:
        return "separation_error"
    if "ffmpeg" in msg:
        return "audio_conversion_error"
    if "upload" in msg or "storage" in msg:
        return "storage_error"
    return "pipeline_error"


def detect_chords(audio_path: str) -> tuple[list[dict], float]:
    """
    Run chord recognition with the BTC (Bi-directional Transformer for Chord
    Recognition) model from BTC-ISMIR19, plus librosa beat tracking for BPM.

    Returns ([{start, end, label, standard, confidence}, ...], bpm).
    """
    chords = btc_predict_chords(audio_path)

    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    tempo_raw, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = round(float(np.atleast_1d(tempo_raw)[0]), 2)

    return chords, bpm


def fetch_lyrics(title: str, artist: str | None) -> dict | None:
    """
    Fetch lyrics using a multi-source, multi-query fallback chain.

    Strategy (stops at first hit):
      1. Synced LRC — Lrclib, Musixmatch, Deezer, NetEase  (best accuracy)
      2. Word-level sync — Musixmatch enhanced=True         (finest granularity)
      3. Synced LRC — all remaining providers               (Genius, Megalobiz)
      4. Plain text  — all providers                        (last resort)

    Each tier is tried with up to 3 query variants:
      "{title} {artist}", "{artist} {title}", "{title}"
    """
    # Build query variants, deduplicated while preserving order.
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

    # Tier 1 — best synced providers.
    SYNCED_PRIORITY = ["Lrclib", "Musixmatch", "Deezer", "NetEase"]
    for q in queries:
        result = _try(q, providers=SYNCED_PRIORITY, synced_only=True)
        if result:
            log_event("lyrics.found", query=q, tier="synced_priority", enhanced=False)
            return {"synced_lrc": result, "plain_text": None, "source": "syncedlyrics/synced"}

    # Tier 2 — Musixmatch word-level sync.
    for q in queries:
        result = _try(q, providers=["Musixmatch"], synced_only=True, enhanced=True)
        if result:
            log_event("lyrics.found", query=q, tier="musixmatch_enhanced")
            return {"synced_lrc": result, "plain_text": None, "source": "syncedlyrics/musixmatch_enhanced"}

    # Tier 3 — all remaining providers synced.
    for q in queries:
        result = _try(q, synced_only=True)
        if result:
            log_event("lyrics.found", query=q, tier="synced_all")
            return {"synced_lrc": result, "plain_text": None, "source": "syncedlyrics/synced_all"}

    # Tier 4 — plain text fallback across all providers.
    for q in queries:
        result = _try(q, plain_only=True)
        if result:
            # Some providers return LRC even when plain_only is requested.
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
    _SECTION_NAMES = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Outro"]

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
        # Load mono at reduced sample rate for speed.
        y, sr = librosa.load(audio_path, sr=11025, mono=True)

        # MFCC-based feature matrix (efficient for structural segmentation).
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc = librosa.util.normalize(mfcc, axis=1)

        # Build recurrence matrix and compute structural novelty.
        rec = librosa.segment.recurrence_matrix(
            mfcc, width=max(1, int(sr * 8 / 512)), mode="affinity", sym=True
        )
        novelty = librosa.segment.timelag_filter(np.diff)(rec, axis=1)
        novelty_curve = np.mean(np.abs(novelty), axis=0)

        # Smooth the novelty curve to avoid micro-segmentation.
        kernel_size = max(3, int(sr * 4 / 512) | 1)  # ~4s, must be odd
        novelty_smooth = np.convolve(novelty_curve, np.hanning(kernel_size), mode="same")

        # Pick boundary frames as local maxima above the mean.
        threshold = novelty_smooth.mean() + 0.5 * novelty_smooth.std()
        frame_times = librosa.frames_to_time(np.arange(len(novelty_smooth)), sr=sr, hop_length=512)
        min_gap_frames = int(sr * 20 / 512)  # at least 20s between sections

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

        # Deduplicate and sort.
        boundaries = sorted(set(round(b, 2) for b in boundaries))

        # Need at least 2 boundaries to form a section.
        if len(boundaries) < 2:
            return heuristic_fallback()

        # Assign human-readable labels by position.
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
