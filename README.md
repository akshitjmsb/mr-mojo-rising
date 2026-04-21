# Mr. Mojo Rising

AI-powered guitar practice studio:
- import from YouTube
- isolate stems
- detect sections/chords/lyrics
- practice loops at variable speed

## Voice-Only Authentication (Single Mac)

This app now uses **voice-passphrase unlock only** on the login screen.

- Browser target: **Chrome or Edge on macOS**
- No fallback auth path (no password login in UI)
- Unlock scope: once per browser session
- Listening starts automatically when `/login` opens
- First successful unlock enrolls an owner voice profile in Supabase auth user metadata

### Required env vars (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

VOICE_PASSPHRASE=your secret spoken phrase
VOICE_LOGIN_EMAIL=voice-auth-local@example.com
VOICE_LOGIN_PASSWORD=choose-a-strong-password
VOICE_COOKIE_SECRET=long-random-secret
```

## One-time Local Voice User Bootstrap

Create/update the Supabase auth user that the voice endpoint signs in as:

```bash
npm run auth:ensure-voice-user
```

This command reads from `.env.local` and ensures:
- `VOICE_LOGIN_EMAIL` exists
- password is set to `VOICE_LOGIN_PASSWORD`
- email is confirmed

## Run Locally

```bash
npm run dev
./mac-server/start.sh
```

Open [http://localhost:3000](http://localhost:3000), go to `/login`, and use **Start Voice Unlock**.

## Mac Dock Launcher

Use this setup to install a one-click app on your Dock with the project icon.

1. Make scripts executable and run the installer:

   ```bash
   npm run dock:install
   ```

2. Drag `Mr. Mojo Rising.app` from `/Applications` to the Dock.

3. Click the new Dock icon to launch:
   - Next.js app (`npm run dev`)
   - If port `3000` is busy, it auto-falls back to the next free port (`3001`, `3002`, ...)
   - mac-server backend (`./mac-server/start.sh`)
   - opens the selected local URL in Chrome (or default browser if Chrome is unavailable)
   - launches through Terminal to avoid macOS Desktop-folder permission issues

Logs are written to:
- `~/Library/Logs/MrMojoRising-launch.log` (launcher process)
- `./.mmr-logs/web.log` and `./.mmr-logs/server.log` (app/server logs)
- `./.mmr-logs/npm-install.log` (when dependency install is needed)

### Additional control commands

- `npm run dock:start` starts services and opens the app.
  - If dependencies are missing, it will run `npm install` automatically.
  - If required env vars are missing, it will notify you and stop.
- `npm run dock:stop` stops running app services.
- `npm run dock:restart` forces a clean stop then start.

## Owner Voice Profile Notes

- The first successful unlock enrolls the current voiceprint as owner.
- Future unlock attempts must match both:
  - passphrase text
  - enrolled voice profile similarity threshold
- To re-enroll a different owner voice, remove `voice_profile_vector` from the voice auth user's metadata (or recreate that user with `npm run auth:ensure-voice-user` and then clear metadata).
