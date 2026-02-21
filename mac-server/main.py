"""
Mr. Mojo Rising — Mac FastAPI Server
Handles YouTube download, Demucs stem separation, and section detection.
Runs locally on the Mac with GPU access for Demucs processing.
"""

import os
import uuid
import asyncio
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

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


class StatusResponse(BaseModel):
    song_id: str
    status: str


# In-memory job tracking
jobs: dict[str, str] = {}  # song_id -> status


@app.post("/process", dependencies=[Depends(verify_token)])
async def process_song(req: ProcessRequest):
    """Start processing a song: download, separate stems, detect sections."""
    jobs[req.song_id] = "processing"

    # Run in background
    asyncio.create_task(_process_pipeline(req.song_id, req.youtube_url))

    return {"song_id": req.song_id, "status": "processing"}


@app.get("/status/{song_id}")
async def get_status(song_id: str):
    status = jobs.get(song_id, "unknown")
    return StatusResponse(song_id=song_id, status=status)


async def _process_pipeline(song_id: str, youtube_url: str):
    """Full processing pipeline: download -> demucs -> detect sections -> upload."""
    sb = get_supabase()

    try:
        # Update status to processing
        sb.table("songs").update({"status": "processing"}).eq("id", song_id).execute()

        # Step 1: Download audio with yt-dlp
        work_dir = OUTPUT_DIR / song_id
        work_dir.mkdir(parents=True, exist_ok=True)
        audio_path = work_dir / "original.wav"

        dl_proc = await asyncio.create_subprocess_exec(
            "yt-dlp",
            "-x",
            "--audio-format", "wav",
            "--audio-quality", "0",
            "-o", str(audio_path),
            youtube_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await dl_proc.communicate()

        if dl_proc.returncode != 0:
            raise Exception("yt-dlp download failed")

        # Try to extract title from yt-dlp
        title_proc = await asyncio.create_subprocess_exec(
            "yt-dlp",
            "--get-title",
            youtube_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        title_stdout, _ = await title_proc.communicate()
        title = title_stdout.decode().strip() if title_proc.returncode == 0 else "Unknown Title"

        # Update title
        sb.table("songs").update({"title": title}).eq("id", song_id).execute()

        # Step 2: Run Demucs stem separation
        demucs_out = work_dir / "demucs"
        demucs_proc = await asyncio.create_subprocess_exec(
            "python", "-m", "demucs",
            "--two-stems=vocals",  # First pass: vocals vs accompaniment
            "-o", str(demucs_out),
            str(audio_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await demucs_proc.communicate()

        # Run full 4-stem separation
        demucs_full_proc = await asyncio.create_subprocess_exec(
            "python", "-m", "demucs",
            "-o", str(demucs_out),
            "--name", "htdemucs",
            str(audio_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await demucs_full_proc.communicate()

        # Find output stems
        stems_dir = None
        for d in demucs_out.rglob("*"):
            if d.is_dir() and (d / "guitar.wav").exists():
                stems_dir = d
                break
            # htdemucs uses "other" instead of "guitar"
            if d.is_dir() and (d / "other.wav").exists():
                stems_dir = d
                break

        # Step 3: Upload stems to Supabase Storage
        def upload_file(local_path: Path, storage_path: str):
            with open(local_path, "rb") as f:
                sb.storage.from_("stems").upload(storage_path, f.read())
            return sb.storage.from_("stems").get_public_url(storage_path)

        # Upload original
        original_url = upload_file(audio_path, f"{song_id}/original.wav")

        # Upload separated stems
        guitar_url = None
        vocals_url = None
        drums_url = None
        bass_url = None

        if stems_dir:
            for stem_name in ["guitar", "other", "vocals", "drums", "bass"]:
                stem_file = stems_dir / f"{stem_name}.wav"
                if stem_file.exists():
                    url = upload_file(stem_file, f"{song_id}/{stem_name}.wav")
                    if stem_name in ("guitar", "other"):
                        guitar_url = url
                    elif stem_name == "vocals":
                        vocals_url = url
                    elif stem_name == "drums":
                        drums_url = url
                    elif stem_name == "bass":
                        bass_url = url

        # Create stems record
        sb.table("stems").insert({
            "song_id": song_id,
            "original_url": original_url,
            "guitar_url": guitar_url,
            "vocals_url": vocals_url,
            "drums_url": drums_url,
            "bass_url": bass_url,
        }).execute()

        # Step 4: Simple section detection (based on audio energy changes)
        # For now, create basic sections based on duration
        # A more sophisticated approach would use librosa for onset detection
        import wave
        with wave.open(str(audio_path), "r") as wf:
            duration = wf.getnframes() / wf.getframerate()

        sections = _detect_sections(duration)
        for section in sections:
            sb.table("sections").insert({
                "song_id": song_id,
                "label": section["label"],
                "start_time": section["start"],
                "end_time": section["end"],
            }).execute()

        # Mark as ready
        sb.table("songs").update({"status": "ready"}).eq("id", song_id).execute()
        jobs[song_id] = "ready"

    except Exception as e:
        print(f"Processing failed for {song_id}: {e}")
        sb.table("songs").update({"status": "failed"}).eq("id", song_id).execute()
        jobs[song_id] = "failed"


def _detect_sections(duration: float) -> list[dict]:
    """
    Basic section detection based on common song structure.
    TODO: Replace with librosa-based onset/beat detection for real accuracy.
    """
    if duration < 60:
        return [{"label": "Full Song", "start": 0, "end": duration}]

    sections = []
    # Simple heuristic: intro (8%), verse (20%), chorus (15%), verse (20%), chorus (15%), bridge (10%), outro (12%)
    markers = [
        ("Intro", 0.0, 0.08),
        ("Verse I", 0.08, 0.28),
        ("Chorus", 0.28, 0.43),
        ("Verse II", 0.43, 0.63),
        ("Chorus", 0.63, 0.78),
        ("Bridge", 0.78, 0.88),
        ("Outro", 0.88, 1.0),
    ]
    for label, start_pct, end_pct in markers:
        sections.append({
            "label": label,
            "start": round(start_pct * duration, 2),
            "end": round(end_pct * duration, 2),
        })

    return sections
