# CLAUDE.md

Source of truth for working in this repo. Read this before changing anything.

## What this is

**Mr. Mojo Rising** — a single-user, mobile-first web app that turns any YouTube
song into a guitar practice tool. Paste a URL, get an isolated guitar stem,
auto-detected sections, chord chart and synced lyrics, then loop any section at
any speed.

The app has **no auth**: it is a public app deployed on Vercel + Supabase Cloud,
intended for the owner's personal use on a phone. The Mac server runs locally
on the owner's machine and is exposed to the cloud via a Cloudflare tunnel.

## Architecture

```
┌──────────────────────────────────┐      ┌────────────────────────────┐
│ Next.js 16 (App Router) on       │      │ Supabase Cloud             │
│ Vercel                           │◄────►│ • Postgres (jobs, songs,   │
│ • UI (mobile, 420px max)         │      │   sections, chords, …)     │
│ • API routes (REST + admin)      │      │ • Storage (`stems` bucket) │
│ • Polling/Realtime status        │      │ • Realtime (jobs feed)     │
└──────────────┬───────────────────┘      └─────────────┬──────────────┘
               │                                        ▲
               │ POST /api/songs/import                 │ claim/update
               │ (insert song + processing_jobs row)    │ via service role
               ▼                                        │
        processing_jobs (queued) ─────────────► ┌──────┴───────────────┐
                                                │ mac-server (FastAPI) │
                                                │ • polls queue        │
                                                │ • yt-dlp → audio     │
                                                │ • Demucs (MPS) stems │
                                                │ • librosa sections + │
                                                │   chord detect       │
                                                │ • syncedlyrics LRC   │
                                                │ • uploads to Storage │
                                                └──────────────────────┘
```

### Request lifecycle for an import

1. User pastes a YouTube URL → `POST /api/songs/import` (admin client)
   inserts a `songs` row with `status='queued'` and a sibling `processing_jobs`
   row. Returns `{ id }`.
2. Mac server polls `claim_next_job(worker_id)` (Postgres function with row-level
   lock + heartbeat). It downloads audio with `yt-dlp`, runs Demucs to split
   stems, runs librosa for sections + chord detection, fetches LRC from
   `syncedlyrics`, uploads stems to the `stems` bucket and writes the metadata
   tables.
3. Throughout, the worker updates `songs.status` / `songs.processing_stage` and
   sends heartbeats to the job row.
4. Browser tracks progress via Supabase Realtime on `processing_jobs` (preferred)
   or `GET /api/songs/[id]/status` (fallback).
5. When `status='ready'`, browser navigates to `/song/[id]`.

## Tech stack

- **Next.js 16** App Router + React 19 + TypeScript strict
- **Tailwind CSS v4** (with `@tailwindcss/postcss`)
- **@supabase/ssr** for cookie-aware browser/server clients,
  `@supabase/supabase-js` for the admin (service-role) client
- **Vercel** for Next.js hosting; **Supabase Cloud** for Postgres/Storage/Realtime
- **mac-server**: Python 3.11 + FastAPI + Demucs + librosa + syncedlyrics
- **Cloudflare Tunnel** to expose mac-server publicly when away from home

## File layout

```
src/
  app/
    layout.tsx              # root html + fonts + the shared 420px shell
    globals.css             # Tailwind import + design tokens + ambient effects
    page.tsx                # / — Import flow (paste URL, watch progress)
    library/page.tsx        # /library — list/delete/retry songs
    practice/page.tsx       # /practice — redirects to most recent ready song
    song/[id]/page.tsx      # /song/[id] — player; thin wrapper
    song/[id]/_components/  # player sub-components (PlayerControls, etc.)
    error.tsx, loading.tsx  # route-level boundaries
    api/
      songs/route.ts                  # GET list
      songs/[id]/route.ts             # GET full bundle, DELETE song + storage
      songs/[id]/status/route.ts      # GET lightweight status
      songs/[id]/download/route.ts    # GET stream a stem with attachment headers
      songs/import/route.ts           # POST import (insert song + job)
  components/
    Header.tsx, TabNav.tsx, Footer.tsx
  lib/
    lrc-parser.ts           # parseLrc, findCurrentLineIndex
    database.types.ts       # generated Supabase types — do NOT edit manually
    supabase/
      client.ts   # createBrowserClient (anon, RLS-aware)
      server.ts   # createServerClient (cookies, anon, RLS-aware)
      admin.ts    # createClient with service role — only inside route handlers
mac-server/                 # Python service; not bundled with the web app
supabase/migrations/        # ordered SQL migrations (timestamp prefix)
public/                     # favicon, manifest.json, OG images
```

## Conventions

### Layout shell

The shared 420px-wide column with `<Header />`, `<TabNav />` and `<Footer />`
lives in `app/layout.tsx`. Page files contain only their own content — do not
re-create the shell.

### Styling

- **Tailwind first.** Default to utility classes. Inline `style={{}}` is reserved
  for runtime/dynamic values (computed widths, transient colors, etc.).
- **Design tokens live in `globals.css`** under `@theme inline` and are exposed
  to Tailwind as classes (e.g. `bg-bg`, `text-gold`, `border-border-dark`).
  Use those classes; do not hard-code hex values.
- Two custom font families: `font-playfair` (serif italic display) and
  `font-josefin` (sans, lowercase tracking). They are wired through CSS vars in
  `app/layout.tsx`.

### Design tokens (current set)

| Token             | Hex       | Use                                  |
|-------------------|-----------|--------------------------------------|
| `bg`              | `#050403` | App background                       |
| `gold`            | `#EAC05E` | Active state, focal accent           |
| `orange`          | `#E0965C` | Secondary accent (chord labels)      |
| `terracotta`      | `#D46A45` | Errors, destructive confirm          |
| `purple`          | `#A68AB6` | Section colors                       |
| `text`            | `#F8F2E8` | Primary copy                         |
| `text-secondary`  | `#E8DCC0` | Subtitles                            |
| `text-muted`      | `#C0B090` | Body sub-copy                        |
| `text-dark`       | `#A09070` | Tertiary copy                        |
| `text-darker`     | `#D0C0A0` | Section names (inactive)             |
| `text-darkest`    | `#8F8068` | Weakest copy (footer)                |
| `border`          | `#6A5C45` | Strong borders                       |
| `border-dark`     | `#4A4030` | Default borders                      |
| `border-darkest`  | `#3A2E20` | Faint dividers                       |
| `input-bg`        | `#1F1A16` | Input background                     |
| `inactive`        | `#352E22` | Inactive waveform bars               |

### React patterns

- All page files are `"use client"` because they manage audio/playback state.
  Keep heavy client-only logic behind `next/dynamic` so route navigation stays
  cheap (the player is the heavy one).
- Polling is a last resort — prefer **Supabase Realtime** subscriptions on
  `processing_jobs` and `songs` for status updates. Polling drains mobile
  battery.
- Touch first: use **pointer events** (`onPointerDown` / `pointerdown`) instead
  of `onMouseEnter`/`mousedown`. Combine `pointer` for primary interactions and
  fall back to native `:hover` styles via Tailwind for desktop affordances.

### Supabase clients — pick the right one

- `createClient()` from `lib/supabase/client.ts` — browser, anon key.
  Use in `"use client"` components for Realtime and reads.
- `createClient()` from `lib/supabase/server.ts` — RSC/route handlers, anon key
  with cookies. Use for read endpoints that should respect RLS.
- `createAdminClient()` from `lib/supabase/admin.ts` — service role.
  **Never import in client code.** Use only inside route handlers / server-side
  scripts when bypassing RLS is required (e.g. the import endpoint, the DELETE
  endpoint, the download proxy).

### Path aliases

Use `@/` (resolves to `src/`) for all imports.

## Dev workflow

```bash
# Install
npm install

# Run web app + local Supabase together
npm run start:local    # starts supabase + next dev in parallel

# Web only
npm run dev

# Mac server
./mac-server/start.sh

# Build / lint
npm run build
npm run lint
```

### Required env vars

In `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...     # server-only — never exposed to browser
```

The Mac server reads `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `API_SECRET`,
`OUTPUT_DIR`, plus Demucs tuning vars; see `mac-server/main.py` for the full
list.

## Guidelines

- **Mobile is the target.** Test in Chrome DevTools at iPhone widths. Don't
  break pinch-zoom (no `maximumScale: 1` in viewport). Tap targets ≥ 32 px.
- **Keep the player snappy.** Animation frame loops, audio scrubbing and the
  metronome should not stutter on a phone. If a change risks dropped frames,
  measure before merging.
- **Do not introduce auth.** The legacy auth code was removed in
  `20260420000000_drop_auth_coupling.sql`; the app is intentionally public.
- **Edit the right migration file.** Never modify a committed migration —
  always add a new timestamped one.
- **`database.types.ts` is generated.** Regenerate it via Supabase CLI rather
  than hand-editing.
- **Don't add backend logic to the web app.** YouTube download, stem
  separation, chord/section detection, lyrics fetching all live in mac-server.
  The Next.js side is a thin UI + queue submitter.
