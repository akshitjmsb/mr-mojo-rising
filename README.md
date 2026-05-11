# Mr. Mojo Rising

AI-powered guitar practice studio:
- import from YouTube
- isolate stems
- detect sections/chords/lyrics
- practice loops at variable speed

## Production Shape

The phone/PWA runs from Vercel. Heavy audio processing runs on this Mac.

1. Vercel serves the Next.js app and API routes.
2. Imports create rows in the shared Turso `processing_jobs` queue.
3. `mac-server/start.sh` runs the local worker that claims queued jobs.
4. Processed stems are uploaded to Vercel Blob.
5. The phone polls Turso through Vercel until the song is ready.

If the phone says the Mac worker is offline, start the local worker:

```bash
./mac-server/start.sh
```

For the Dock launcher:

```bash
npm run dock:start
```

## Required Environment

Set these in Vercel production and in local `.env.local` for the Mac worker:

```bash
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

Optional:

```bash
YOUTUBE_API_KEY=...                 # search and Spotify-to-YouTube matching
WORKER_CONCURRENCY=1
YTDLP_DOWNLOAD_TIMEOUT_SECONDS=300
FFMPEG_TIMEOUT_SECONDS=180
DEMUCS_TIMEOUT_SECONDS=900
UPLOAD_TIMEOUT_SECONDS=600
ANALYZE_TIMEOUT_SECONDS=420
LYRICS_TIMEOUT_SECONDS=120
JOB_TIMEOUT_SECONDS=1800
```

Do not set `YTDLP_COOKIES_FROM_BROWSER` unless you explicitly want the worker
to read browser cookies. On macOS that can trigger a Keychain prompt.

## Run Locally

```bash
npm install
npm run db:migrate
npm run dev
./mac-server/start.sh
```

Open [http://localhost:3000](http://localhost:3000).

## Mac Dock Launcher

Install the Dock app:

```bash
npm run dock:install
```

Then launch with:

```bash
npm run dock:start
```

Logs are written to:
- `~/Library/Logs/MrMojoRising-launch.log`
- `.mmr-logs/web.log`
- `.mmr-logs/server.log`
- `.mmr-logs/npm-install.log`

Control commands:

```bash
npm run dock:stop
npm run dock:restart
```
