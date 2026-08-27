# Mr. Mojo Rising
> *"Mr. Mojo Risin'" — The Doors, L.A. Woman, 1971.*

An AI-powered guitar-learning system I built for myself. Drop in any song, get back isolated stems, chords, lyrics, and loopable sections — then put the phone down and play.

---

## The Problem

Learning a song from YouTube means: scrubbing, rewinding, missing chord changes, losing the section you needed. I wanted a tool that actually understands the song — and lets me practice it the way I think about it, not the way a video player works.

The interaction rule is simple: make one choice, hear the useful sound immediately, and require no more phone handling while the section repeats.

## What It Does

1. **Add Song** — Search by song or artist, or paste a YouTube link. The song gets queued for processing.
2. **Stem Isolation** — Demucs separates guitar, vocals, drums, and bass.
3. **Analysis** — Sections detected (intro, verse, chorus), chords identified, lyrics extracted.
4. **Song Map** — Every section, separated layer, lyric, chord change, and lead note shares one master clock. Verified evidence, best guesses, and withheld results remain visibly distinct.

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
