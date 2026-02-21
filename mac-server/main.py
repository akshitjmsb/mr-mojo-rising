"""
Mr. Mojo Rising — Mac FastAPI Server
Handles YouTube download, Demucs stem separation, and section detection.
Runs locally on the Mac with GPU access for Demucs processing.
"""

import os
import asyncio
import wave
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


@app.get("/health")
async def health():
    return {"status": "ok"}


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


async def _run(cmd: list[str], label: str) -> tuple[bytes, bytes]:
    """Run a subprocess and raise on failure."""
    print(f"  [{label}] Running: {' '.join(cmd)}")
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        print(f"  [{label}] FAILED (exit {proc.returncode})")
        print(f"  stderr: {stderr.decode()[:500]}")
        raise Exception(f"{label} failed (exit {proc.returncode})")
    print(f"  [{label}] Done")
    return stdout, stderr


async def _process_pipeline(song_id: str, youtube_url: str):
    """Full processing pipeline: download -> demucs -> detect sections -> upload."""
    sb = get_supabase()

    try:
        sb.table("songs").update({"status": "processing"}).eq("id", song_id).execute()
        print(f"\n{'='*60}")
        print(f"Processing song {song_id}")
        print(f"URL: {youtube_url}")
        print(f"{'='*60}")

        work_dir = OUTPUT_DIR / song_id
        work_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: Download audio with yt-dlp
        print("\nStep 1: Downloading audio...")
        await _run([
            "yt-dlp",
            "-x",
            "--audio-format", "wav",
            "--audio-quality", "0",
            "-o", str(work_dir / "original.%(ext)s"),
            "--no-playlist",
            youtube_url,
        ], "yt-dlp download")

        # Find the downloaded wav file
        audio_path = work_dir / "original.wav"
        if not audio_path.exists():
            # yt-dlp might have kept the original format, convert with ffmpeg
            for ext in ["webm", "m4a", "mp3", "opus", "ogg"]:
                candidate = work_dir / f"original.{ext}"
                if candidate.exists():
                    await _run([
                        "ffmpeg", "-i", str(candidate),
                        "-ar", "44100", "-ac", "2",
                        str(audio_path), "-y"
                    ], "ffmpeg convert")
                    break

        if not audio_path.exists():
            raise Exception("No audio file found after download")

        # Get title
        print("  Fetching title...")
        title_stdout, _ = await _run([
            "yt-dlp", "--get-title", "--no-playlist", youtube_url
        ], "yt-dlp title")
        title = title_stdout.decode().strip() or "Unknown Title"

        # Try to parse "Artist - Title" format
        artist = None
        if " - " in title:
            parts = title.split(" - ", 1)
            artist = parts[0].strip()
            title = parts[1].strip()

        sb.table("songs").update({
            "title": title,
            **({"artist": artist} if artist else {}),
        }).eq("id", song_id).execute()
        print(f"  Title: {title}" + (f" by {artist}" if artist else ""))

        # Step 2: Run Demucs 4-stem separation (htdemucs)
        print("\nStep 2: Running Demucs stem separation...")
        demucs_out = work_dir / "separated"
        await _run([
            "python3.11", "-m", "demucs",
            "-n", "htdemucs",
            "-o", str(demucs_out),
            str(audio_path),
        ], "demucs")

        # Find output stems — htdemucs outputs: vocals, drums, bass, other
        stems_dir = None
        for d in sorted(demucs_out.rglob("*")):
            if d.is_dir() and (d / "vocals.wav").exists():
                stems_dir = d
                break

        if not stems_dir:
            print("  WARNING: No stems found, falling back to original only")

        # Step 3: Upload to Supabase Storage
        print("\nStep 3: Uploading stems...")

        def upload_file(local_path: Path, storage_path: str) -> str:
            with open(local_path, "rb") as f:
                data = f.read()
            print(f"  Uploading {storage_path} ({len(data) // 1024}KB)")
            sb.storage.from_("stems").upload(
                storage_path, data,
                file_options={"content-type": "audio/wav"}
            )
            return sb.storage.from_("stems").get_public_url(storage_path)

        original_url = upload_file(audio_path, f"{song_id}/original.wav")

        guitar_url = None
        vocals_url = None
        drums_url = None
        bass_url = None

        if stems_dir:
            stem_map = {
                "other": "guitar_url",
                "vocals": "vocals_url",
                "drums": "drums_url",
                "bass": "bass_url",
            }
            urls = {}
            for stem_name, url_key in stem_map.items():
                stem_file = stems_dir / f"{stem_name}.wav"
                if stem_file.exists():
                    urls[url_key] = upload_file(stem_file, f"{song_id}/{stem_name}.wav")

            guitar_url = urls.get("guitar_url")
            vocals_url = urls.get("vocals_url")
            drums_url = urls.get("drums_url")
            bass_url = urls.get("bass_url")

        sb.table("stems").insert({
            "song_id": song_id,
            "original_url": original_url,
            "guitar_url": guitar_url,
            "vocals_url": vocals_url,
            "drums_url": drums_url,
            "bass_url": bass_url,
        }).execute()

        # Step 4: Section detection
        print("\nStep 4: Detecting sections...")
        with wave.open(str(audio_path), "r") as wf:
            duration = wf.getnframes() / wf.getframerate()
        print(f"  Duration: {duration:.1f}s")

        sections = _detect_sections(duration)
        for section in sections:
            sb.table("sections").insert({
                "song_id": song_id,
                "label": section["label"],
                "start_time": section["start"],
                "end_time": section["end"],
            }).execute()
        print(f"  Created {len(sections)} sections")

        # Done!
        sb.table("songs").update({"status": "ready"}).eq("id", song_id).execute()
        jobs[song_id] = "ready"
        print(f"\n{'='*60}")
        print(f"DONE — Song {song_id} is ready!")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"\nFAILED — Song {song_id}: {e}")
        sb.table("songs").update({"status": "failed"}).eq("id", song_id).execute()
        jobs[song_id] = "failed"


def _detect_sections(duration: float) -> list[dict]:
    """
    Basic section detection based on common song structure.
    TODO: Replace with librosa-based onset/beat detection for real accuracy.
    """
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
        {
            "label": label,
            "start": round(start_pct * duration, 2),
            "end": round(end_pct * duration, 2),
        }
        for label, start_pct, end_pct in markers
    ]
