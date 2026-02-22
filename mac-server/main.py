"""
Mr. Mojo Rising — Mac FastAPI Server
Handles YouTube download, Demucs stem separation, section detection,
chord detection, and lyrics fetching.
Runs locally on the Mac with GPU access for Demucs processing.
"""

import os
import asyncio
import wave
import traceback
from pathlib import Path

import numpy as np
import librosa
import syncedlyrics

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

        # Step 5: Chord detection (non-fatal)
        print("\nStep 5: Detecting chords...")
        try:
            chords = _detect_chords(str(audio_path))
            for chord in chords:
                sb.table("chords").insert({
                    "song_id": song_id,
                    "start_time": chord["start"],
                    "end_time": chord["end"],
                    "chord_label": chord["label"],
                    "chord_standard": chord["standard"],
                    "confidence": chord["confidence"],
                }).execute()
            print(f"  Detected {len(chords)} chord segments")
        except Exception as e:
            print(f"  Chord detection failed (non-fatal): {e}")

        # Step 6: Lyrics fetching (non-fatal)
        print("\nStep 6: Fetching lyrics...")
        try:
            lyrics = _fetch_lyrics(title, artist)
            if lyrics:
                sb.table("lyrics").insert({
                    "song_id": song_id,
                    "synced_lrc": lyrics["synced_lrc"],
                    "plain_text": lyrics["plain_text"],
                    "source": lyrics["source"],
                }).execute()
                print(f"  Lyrics found (source: {lyrics['source']}, synced: {lyrics['synced_lrc'] is not None})")
            else:
                print("  No lyrics found")
        except Exception as e:
            print(f"  Lyrics fetching failed (non-fatal): {e}")

        # Done!
        sb.table("songs").update({"status": "ready"}).eq("id", song_id).execute()
        jobs[song_id] = "ready"
        print(f"\n{'='*60}")
        print(f"DONE — Song {song_id} is ready!")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"\nFAILED — Song {song_id}: {e}")
        traceback.print_exc()
        try:
            sb.table("songs").update({"status": "failed"}).eq("id", song_id).execute()
        except Exception as e2:
            print(f"  Also failed to update status: {e2}")
        jobs[song_id] = "failed"


def _detect_chords(audio_path: str) -> list[dict]:
    """
    Detect chords from audio using librosa chroma features + template matching.
    Returns list of {start, end, label, standard, confidence}.
    """
    # 24 chord templates: 12 major + 12 minor
    NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    # Major chord template: root, major third (+4), fifth (+7)
    # Minor chord template: root, minor third (+3), fifth (+7)
    def make_template(root_idx: int, minor: bool = False) -> np.ndarray:
        t = np.zeros(12)
        t[root_idx % 12] = 1.0
        t[(root_idx + (3 if minor else 4)) % 12] = 0.8
        t[(root_idx + 7) % 12] = 0.8
        norm = np.linalg.norm(t)
        return t / norm if norm > 0 else t

    templates = {}
    for i, name in enumerate(NOTE_NAMES):
        templates[name] = make_template(i, minor=False)
        templates[f"{name}m"] = make_template(i, minor=True)

    # Load audio
    y, sr = librosa.load(audio_path, sr=22050, mono=True)

    # Extract harmonic component for cleaner chroma
    y_harm = librosa.effects.harmonic(y)

    # Compute CQT chroma features
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=512)
    hop_length = 512
    frame_duration = hop_length / sr

    # For each frame, find best matching chord
    raw_chords = []
    for frame_idx in range(chroma.shape[1]):
        frame_vec = chroma[:, frame_idx]
        frame_norm = np.linalg.norm(frame_vec)
        if frame_norm < 0.01:
            raw_chords.append(("N", 0.0))  # silence / no chord
            continue

        frame_vec_n = frame_vec / frame_norm

        best_chord = "N"
        best_sim = -1.0
        for chord_name, tmpl in templates.items():
            sim = float(np.dot(frame_vec_n, tmpl))
            if sim > best_sim:
                best_sim = sim
                best_chord = chord_name

        raw_chords.append((best_chord, best_sim))

    # Merge consecutive identical chords, enforce 0.3s minimum duration
    MIN_DURATION = 0.3
    merged: list[dict] = []

    if raw_chords:
        current_label = raw_chords[0][0]
        current_start = 0.0
        current_conf_sum = raw_chords[0][1]
        current_count = 1

        for i in range(1, len(raw_chords)):
            label, conf = raw_chords[i]
            time = i * frame_duration

            if label == current_label:
                current_conf_sum += conf
                current_count += 1
            else:
                end_time = time
                duration = end_time - current_start
                if duration >= MIN_DURATION and current_label != "N":
                    merged.append({
                        "start": round(current_start, 3),
                        "end": round(end_time, 3),
                        "label": current_label,
                        "standard": current_label,
                        "confidence": round(current_conf_sum / current_count, 3),
                    })
                current_label = label
                current_start = time
                current_conf_sum = conf
                current_count = 1

        # Final segment
        end_time = len(raw_chords) * frame_duration
        duration = end_time - current_start
        if duration >= MIN_DURATION and current_label != "N":
            merged.append({
                "start": round(current_start, 3),
                "end": round(end_time, 3),
                "label": current_label,
                "standard": current_label,
                "confidence": round(current_conf_sum / current_count, 3),
            })

    return merged


def _fetch_lyrics(title: str, artist: str | None) -> dict | None:
    """
    Fetch synced lyrics using syncedlyrics library.
    Returns {synced_lrc, plain_text, source} or None.
    """
    search_query = f"{title} {artist}" if artist else title

    # Try synced (LRC) lyrics first
    try:
        lrc = syncedlyrics.search(search_query, synced_only=True)
        if lrc:
            return {
                "synced_lrc": lrc,
                "plain_text": None,
                "source": "syncedlyrics",
            }
    except Exception as e:
        print(f"  syncedlyrics synced search error: {e}")

    # Fall back to plain lyrics
    try:
        plain = syncedlyrics.search(search_query, synced_only=False)
        if plain:
            # Check if it's actually synced (has timestamps)
            if plain.strip().startswith("["):
                return {
                    "synced_lrc": plain,
                    "plain_text": None,
                    "source": "syncedlyrics",
                }
            return {
                "synced_lrc": None,
                "plain_text": plain,
                "source": "syncedlyrics",
            }
    except Exception as e:
        print(f"  syncedlyrics plain search error: {e}")

    return None


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
