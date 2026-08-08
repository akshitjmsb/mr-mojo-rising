# Mr. Mojo Rising
> *"Mr. Mojo Risin'" — The Doors, L.A. Woman, 1971.*

An AI-powered guitar practice studio I built for myself. Drop in any song, get back isolated stems, chords, lyrics, and loopable sections — all on your phone while you play.

---

## The Problem

Learning a song from YouTube means: scrubbing, rewinding, missing chord changes, losing the section you needed. I wanted a tool that actually understands the song — and lets me practice it the way I think about it, not the way a video player works.

## What It Does

1. **Add Song** — Search by song or artist, or paste a YouTube/Spotify link. The song gets queued for processing.
2. **Stem Isolation** — Demucs separates guitar, vocals, drums, and bass.
3. **Analysis** — Sections detected (intro, verse, chorus), chords identified, lyrics extracted.
4. **Practice** — Use tuning-aware chord shapes and tabs, set a precise A/B phrase, count in, and automatically raise the speed after three clean repetitions. Per-song playing setup is saved, while personal practice progress stays on the device.

---

## How It Works

The phone runs light — Next.js PWA on Vercel. The heavy lifting (stem separation, chord detection) runs on a local Mac worker.

```
Phone / PWA (Vercel)
  └── Add Song → writes job to Turso queue
  └── Polls Turso until song is ready

Mac Worker (local)
  └── Claims job from Turso
  └── yt-dlp → downloads audio
  └── Demucs → stem separation
  └── ffmpeg → segment processing
  └── Uploads processed stems to Vercel Blob
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| App / PWA | Next.js · TypeScript · Tailwind CSS |
| Job Queue | Turso (libSQL) |
| Audio Processing | Demucs · ffmpeg · yt-dlp |
| Storage | Vercel Blob |
| Deployment | Vercel · Mac local worker |

---

*Personal tool. Private repository.*

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
