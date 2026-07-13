# CLAUDE.md

Source of truth for working in this repo. Read this before changing anything.

## What this is

**Mr. Mojo Rising** — a single-user, mobile-first web app that turns any YouTube
song into a guitar practice tool. Paste a URL (or search), get an isolated
guitar stem, auto-detected sections, chord chart, synced lyrics and a
time-synced guitar tab, then loop any section at any speed with pitch
preserved. There's also a standalone guitar tuner (`/tuner`).

The app has **no auth**: it is a public app deployed on Vercel, intended for
the owner's personal use on a phone. The Mac server runs locally on the
owner's machine and reaches the same Turso database directly.

## Architecture

```
┌──────────────────────────────────┐      ┌────────────────────────────┐
│ Next.js 16 (App Router) on       │      │ Turso (libSQL/SQLite)      │
│ Vercel                           │◄────►│ songs, stems, sections,    │
│ • UI (mobile, 420px max shell)   │      │ chords, tab_notes, lyrics, │
│ • API routes (REST)              │      │ processing_jobs, worker_*  │
│ • Polls status while processing  │      └─────────────┬──────────────┘
└──────────────┬───────────────────┘                    ▲
               │                                        │ claim/update
               │ POST /api/songs/import                 │ (HTTP libSQL)
               │ (insert song + processing_jobs row)    │
               ▼                                        │
        processing_jobs (queued) ─────────────► ┌──────┴───────────────┐
                                                │ mac-server (FastAPI) │
┌──────────────────────────────────┐            │ • polls queue        │
│ Vercel Blob                      │◄───────────│ • yt-dlp → audio     │
│ stems/{song_id}/*.mp3            │  upload    │ • Demucs + Roformer  │
│ (original/guitar/vocals/…)       │            │   stems              │
└──────────────────────────────────┘            │ • BTC chords, librosa│
                                                │   sections + BPM     │
                                                │ • basic-pitch → tabs │
                                                │ • syncedlyrics LRC   │
                                                └──────────────────────┘
```

### Request lifecycle for an import

1. User pastes a YouTube/Spotify link or searches → `POST /api/songs/import`
   inserts a `songs` row with `status='queued'` and a sibling
   `processing_jobs` row. Returns `{ id }`.
2. The Mac worker polls `claim_next_job(worker_id)` (libSQL write transaction
   with lock + heartbeat). Pipeline stages, in order:
   **download** (yt-dlp → WAV) → **separate** (Demucs `htdemucs_ft`, MPS) →
   **refine** (BS-Roformer vocals + MelBand Roformer guitar via
   audio-separator in `venv-sep`; best-effort) → **upload** (WAV→MP3 via
   ffmpeg, concurrent upload to Vercel Blob) → **transcribe** (basic-pitch on
   the guitar stem → string/fret Viterbi mapping → `tab_notes`; non-fatal) →
   **analyze** (librosa sections, BTC chords + BPM; chords non-fatal) +
   **lyrics** (syncedlyrics, non-fatal, runs in parallel).
3. Throughout, the worker updates `songs.status` / `songs.processing_stage`
   and heartbeats the job row. Failures retry with backoff (max 3 attempts).
4. Browser polls `GET /api/songs/[id]/status` while processing; when
   `status='ready'` it navigates to `/song/[id]`.

## Tech stack

- **Next.js 16** App Router + React 19 + TypeScript strict
- **Tailwind CSS v4** (with `@tailwindcss/postcss`)
- **Turso** (`@libsql/client`) for the database — plain SQL, no ORM
- **Vercel Blob** (`@vercel/blob`) for stem audio storage
- **Vercel** for Next.js hosting
- **mac-server**: Python 3.11 + FastAPI + Demucs + audio-separator (Roformer)
  + BTC chord transformer (vendored in `mac-server/btc/`) + librosa +
  basic-pitch + syncedlyrics

## File layout

```
src/
  app/
    layout.tsx              # root html + theme fonts + ThemeProvider
    globals.css             # Tailwind import + per-theme design tokens
    (main)/                 # route group wrapped in the 420px AppShell
      layout.tsx            # AppShell + Header + TabNav + Footer
      page.tsx              # / — Import flow (paste URL, watch progress)
      search/page.tsx       # /search — YouTube search-based import
      library/page.tsx      # /library — list/delete/retry songs
      practice/page.tsx     # /practice — redirects to most recent ready song
      tuner/page.tsx        # /tuner — mic-based guitar tuner (YIN)
      worker/page.tsx       # /worker — Mac worker status dashboard
    song/[id]/page.tsx      # /song/[id] — player; owns audio + playback state
    song/[id]/_components/  # player panels (TransportControls, TabPanel, …)
    api/
      songs/route.ts                  # GET list
      songs/[id]/route.ts             # GET full bundle, DELETE song + blobs
      songs/[id]/status/route.ts      # GET lightweight status
      songs/[id]/download/route.ts    # GET stream a stem with attachment headers
      songs/import/route.ts           # POST import (insert song + job)
      youtube/search/route.ts         # GET search results
      resolve-link/route.ts           # POST resolve YouTube/Spotify link
      worker/route.ts                 # GET worker status, POST restart command
  components/               # AppShell, Header, TabNav, Footer, ThemeToggle, …
  lib/
    turso.ts                # getTursoClient (libSQL)
    queries.ts              # SQL helpers + job claim/requeue logic
    schema.ts               # SCHEMA_STATEMENTS — idempotent CREATE TABLEs
    migrate.ts              # npm run db:migrate applies schema.ts
    database.types.ts       # hand-maintained row types mirroring schema.ts
    lrc-parser.ts           # parseLrc, findCurrentLineIndex
    intake.ts               # link resolution / search types
    theme/                  # multi-theme system (ThemeProvider, content)
mac-server/                 # Python worker; two venvs (see below)
  main.py                   # FastAPI app + queue worker + pipeline
  tab_transcribe.py         # basic-pitch → fret-position mapping → tab_notes
  turso_db.py               # hand-rolled HTTP libSQL client
  blob_storage.py           # Vercel Blob client (upload/download)
  btc/                      # vendored BTC chord recognition model
  backfill_chords.py        # re-run chords for existing songs
  backfill_tabs.py          # re-run tab transcription for existing songs
scripts/                    # dock app + worker LaunchAgent helpers
public/                     # favicon, manifest.json, OG images
```

## Conventions

### Layout shell

The shared 420px-wide column (`AppShell` + `Header` + `TabNav` + `Footer`)
lives in `src/app/(main)/layout.tsx`. Page files inside `(main)` contain only
their own content — do not re-create the shell. `/song/[id]` has its own
layout.

### Styling

- **Tailwind first.** Default to utility classes. Inline `style={{}}` is
  reserved for runtime/dynamic values (computed positions, transforms, etc.).
- **Design tokens live in `globals.css`** per theme and are exposed to
  Tailwind as classes (`bg-bg`, `text-gold`, `text-terracotta`,
  `border-border-dark`, …). Use the token classes; never hard-code hex values
  — the app is multi-theme (`src/lib/theme/`).
- Font families are theme-wired through CSS vars in `app/layout.tsx`
  (`font-playfair` display serif, `font-josefin` sans, plus theme variants).

### React patterns

- Pages that manage audio/playback are `"use client"`. Keep heavy panels
  behind `next/dynamic` so route navigation stays cheap (the player is the
  heavy one).
- Touch first: use **pointer events** (`onPointerDown`) instead of mouse
  events. Tap targets ≥ 32px.
- The player drives `currentTime` from a single rAF loop; panels receive it
  as a prop. Keep per-frame work in panels O(visible), not O(song).

### Database access

- Web app: `getTursoClient()` from `lib/turso.ts` via the helpers in
  `lib/queries.ts` (`queryOne`, `queryAll`, `execute`). Route handlers only —
  never from client components.
- Schema changes go in `lib/schema.ts` as **idempotent** statements
  (`CREATE TABLE IF NOT EXISTS`), applied with `npm run db:migrate`. The
  worker also defensively ensures tables it writes (`tab_notes`,
  `worker_commands`).
- `database.types.ts` is hand-maintained — keep it in sync with `schema.ts`.

### Path aliases

Use `@/` (resolves to `src/`) for all imports.

## Dev workflow

```bash
npm install
npm run dev            # web app (needs .env.local)
npm run db:migrate     # apply schema.ts to Turso
./mac-server/start.sh  # worker (loads mac-server/.env then .env.local)
npm run build
npm run lint
```

### Required env vars

Web app (`.env.local`):

```
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

Mac server: same three, plus tuning knobs — see `mac-server/.env.example`
for the full list (Demucs, refine models, tab transcription thresholds,
timeouts).

### Mac server venvs

Two Python 3.11 venvs, because the dependency stacks conflict:

- `mac-server/venv` — the worker itself (FastAPI, torch/Demucs, librosa, BTC).
- `mac-server/venv-sep` — CLI-only tools invoked as subprocesses:
  `audio-separator` (Roformer refine passes, needs
  `register_custom_models.py` once for the guitar model) and `basic-pitch`
  (tab transcription: `venv-sep/bin/pip install "basic-pitch[onnx]"`).

## Guidelines

- **Mobile is the target.** Test in Chrome DevTools at iPhone widths. Don't
  break pinch-zoom (no `maximumScale: 1` in viewport).
- **Keep the player snappy.** Animation-frame loops, audio scrubbing, the tab
  lane and the metronome must not stutter on a phone. If a change risks
  dropped frames, measure before merging.
- **Slow practice must preserve pitch.** The player sets
  `audio.preservesPitch = true`; don't regress this.
- **Do not introduce auth.** The app is intentionally public.
- **`schema.ts` statements must stay idempotent** — they re-run on every
  migrate.
- **Don't add backend logic to the web app.** YouTube download, stem
  separation, chord/section detection, tab transcription and lyrics fetching
  all live in mac-server. The Next.js side is a thin UI + queue submitter.
- **Pipeline stages that enrich (chords, tabs, lyrics) are non-fatal** — a
  failure logs and moves on; the song still becomes `ready`.
