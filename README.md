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

## Owner Voice Profile Notes

- The first successful unlock enrolls the current voiceprint as owner.
- Future unlock attempts must match both:
  - passphrase text
  - enrolled voice profile similarity threshold
- To re-enroll a different owner voice, remove `voice_profile_vector` from the voice auth user's metadata (or recreate that user with `npm run auth:ensure-voice-user` and then clear metadata).
