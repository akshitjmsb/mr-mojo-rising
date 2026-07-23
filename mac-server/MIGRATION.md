# Migrating the Mac worker (MacBook → Mac Mini)

Step-by-step guide to move the Python worker to a new Apple Silicon Mac. The
web app on Vercel and the Turso database don't move — only the worker (yt-dlp,
Demucs/Roformer separation, chords, tabs, lyrics).

**The worker is pull-based:** it polls the Turso database for jobs and pushes
results to Turso + Vercel Blob. The web app never calls the Mac directly, so
**no inbound tunnel is required** for the pipeline to work (step 7 is optional).

Do these in order. Budget ~30–60 min, most of it building the two venvs.

## Running this with Claude Code

You can let Claude Code drive most of this. On the Mac Mini: install Homebrew,
`brew install git`, clone the repo, then run `claude` inside the repo and say:

> Follow mac-server/MIGRATION.md to set up this worker. The secret files are
> already copied in.

Two things Claude **cannot** do for you — they're manual on purpose:

1. **The secret files** — `.env.local` (repo root) and `mac-server/.env` are
   gitignored, so they aren't in the clone. Copy them from the old Mac
   (AirDrop/scp) **before** pointing Claude at this guide, or it'll stop at the
   env-var check in step 6. **Never commit these or paste their values into any
   tracked file** — the tokens grant write access to the production database and
   blob storage, and git history is permanent.
2. **The Cloudflare tunnel** (step 7) is **optional and usually unnecessary** —
   the pipeline runs entirely through Turso. Skip it unless you specifically
   want direct HTTP access to the FastAPI server.

Everything else — system deps, building the venvs, registering models, the
smoke test, the LaunchAgent — Claude can run directly.

## 0. Prerequisites

- **Apple Silicon Mac** (M-series). Demucs runs on the MPS backend — Intel is
  unsupported here.
- **Homebrew** installed (`/opt/homebrew`). If missing:
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```
- SSH/GitHub access to this repo.
- The two secret files from the old Mac (see step 3) — grab them **before**
  wiping the MacBook.

## 1. System dependencies

```bash
brew install python@3.11 ffmpeg cloudflared
```

- `python@3.11` — both venvs must be Python **3.11** (the torch/Demucs and
  audio-separator stacks are pinned to it).
- `ffmpeg` — WAV→MP3 encoding for stem uploads.
- `cloudflared` — **optional**, only for the tunnel in step 7. The pipeline
  doesn't need it; skip if you're not exposing the FastAPI server. Drop it from
  the `brew install` line above if you don't want it.
- `rsync` and `curl` ship with macOS.

## 2. Clone the repo

```bash
git clone <this-repo-url> ~/Code/"Mr. Mojo Rising"
cd ~/Code/"Mr. Mojo Rising"
```

## 3. Copy the secret files (not in git)

Copy these two from the old Mac (AirDrop / scp / USB). Both are gitignored and
hold real credentials.

**`.env.local`** (repo root) — used by the worker and the web app:

| Var | Purpose |
|-----|---------|
| `TURSO_DATABASE_URL` | libSQL database |
| `TURSO_AUTH_TOKEN` | Turso auth |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (stem storage) |

**`mac-server/.env`** — worker-only config. Includes the same three Turso/Blob
values plus:

| Var | Purpose |
|-----|---------|
| `API_SECRET` / `MAC_API_SECRET` | shared secret the Vercel side sends |
| `OUTPUT_DIR`, `WORKER_ID`, `WORKER_CONCURRENCY` | worker runtime |
| `DEMUCS_*` (`DEVICE=mps`, `MODEL=htdemucs_ft`, `JOBS`, `SHIFTS`) | separation |
| `VOCAL_REFINE_ENABLED`, `GUITAR_REFINE_ENABLED` | Roformer refine passes |
| `TAB_TRANSCRIBE_ENABLED`, `TAB_*`, `BASIC_PITCH_BIN` | tab transcription |
| `SEPARATOR_MODEL_DIR` | where custom Roformer models live |

If you can't copy `mac-server/.env`, rebuild it from
[`mac-server/.env.example`](.env.example) and fill in the secrets.

## 4. Build both venvs from the frozen requirements

Two separate Python 3.11 venvs — their dependency stacks conflict, so they
must stay isolated.

```bash
cd mac-server

# Worker venv (FastAPI, torch/Demucs, librosa, BTC chords)
python3.11 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements-worker.txt

# Separator venv (audio-separator Roformer + basic-pitch tabs)
python3.11 -m venv venv-sep
./venv-sep/bin/pip install --upgrade pip
./venv-sep/bin/pip install -r requirements-separator.txt
```

- [`requirements-worker.txt`](requirements-worker.txt) — exact pins for `venv`.
- [`requirements-separator.txt`](requirements-separator.txt) — exact pins for
  `venv-sep`.

These are `pip freeze` snapshots for reproducible builds. Regenerate after any
intentional upgrade:
```bash
./venv/bin/python -m pip freeze > requirements-worker.txt
./venv-sep/bin/python -m pip freeze > requirements-separator.txt
```

## 5. Register the custom Roformer guitar model

`audio-separator` doesn't ship the becruily MelBand guitar model. This
downloads the checkpoint into `SEPARATOR_MODEL_DIR` and patches `venv-sep`'s
registry. Idempotent — safe to re-run. Run it once per fresh `venv-sep`:

```bash
cd mac-server
python3 register_custom_models.py
```

Expect `registered 1 custom model(s)` (or `registry already up to date`). If
you rebuild `venv-sep` or upgrade `audio-separator`, run this again.

## 6. Smoke test

```bash
cd mac-server
./start.sh
```

`start.sh` loads `.env` then `../.env.local`, checks the three required vars,
and launches uvicorn on `:8000` under a restart supervisor. In another
terminal:

```bash
curl -s http://localhost:8000/docs | head    # FastAPI Swagger HTML
```

Watch the log for the queue poller starting and (if warmup is on) models
loading. `Ctrl-C` to stop when it looks healthy.

## 7. Cloudflare tunnel — OPTIONAL, not required

**Skip this section unless you have a specific reason to expose the FastAPI
server over the internet.** The import pipeline does not use it: the worker
polls Turso for jobs and pushes results to Turso + Vercel Blob, and the web app
reads worker status/commands from Turso too. Nothing on Vercel calls the Mac
directly — there is no `MAC_API_URL` in the worker's env, and there was no
running tunnel or stored credentials on the previous Mac. `:8000` is
effectively local-only (health check / Swagger `/docs`).

The vestigial [`TUNNEL_SETUP.md`](TUNNEL_SETUP.md) and
[`cloudflare-tunnel/config.yml`](cloudflare-tunnel/config.yml) remain for
reference. If you ever *do* want direct HTTP access, create a fresh tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create mojo-mac
cloudflared tunnel route dns mojo-mac mojo-api.<yourdomain>
# fill in <TUNNEL_ID>, credentials-file path and hostname in config.yml, then:
cloudflared tunnel --config cloudflare-tunnel/config.yml run mojo-mac
curl https://mojo-api.<yourdomain>/docs    # should return Swagger HTML
```

## 8. Install the worker LaunchAgent

Runs the worker automatically at login and restarts it if it crashes. The
installer **rsyncs the whole `mac-server/` dir (venvs included) into
`~/Library/Application Support/MrMojoRising/runtime/`** — so build the venvs
(step 4) and register models (step 5) **first**.

```bash
cd ~/Code/"Mr. Mojo Rising"
bash scripts/install-worker-launch-agent.sh
```

This installs `com.mrmojorising.worker`, copies `.env.local` into the runtime
dir, and starts it. Logs land in
`~/Library/Application Support/MrMojoRising/logs/`.

Manage it:
```bash
bash scripts/status-worker-launch-agent.sh      # launchctl print
bash scripts/uninstall-worker-launch-agent.sh   # stop + remove
```

Re-run the installer after any code change to sync the runtime copy.

## 9. End-to-end verification

1. **Worker up:** `curl -s http://localhost:8000/docs | head` returns HTML.
2. **Full pipeline (the real test):** open the app, import a short YouTube song,
   and watch it go `queued → downloading → separating → … → ready`. Confirm the
   worker log shows it claiming the job and the finished song plays with a
   guitar stem, chords, tabs and lyrics. This exercises the whole Turso ⇄ Blob
   loop end to end — no tunnel involved.
3. **Auto-start:** reboot (or `launchctl kickstart -k gui/$(id -u)/com.mrmojorising.worker`)
   and confirm the worker comes back on its own.

Once verified, **decommission the old Mac** so two workers don't both claim
jobs from the queue: `bash scripts/uninstall-worker-launch-agent.sh` on the old
machine (and stop any tunnel if you were running one).

## Troubleshooting

- **`Missing required env vars` on start** — `.env.local` (repo root) and
  `mac-server/.env` aren't both present, or Turso/Blob values are blank.
- **`python3.11: command not found`** — `brew install python@3.11`; it lives at
  `/opt/homebrew/bin/python3.11`.
- **Separation runs on CPU / very slow** — `DEMUCS_DEVICE=mps` must be set and
  you must be on Apple Silicon. Check the worker log for the device line.
- **Guitar refine skipped / model missing** — re-run
  `python3 register_custom_models.py`; confirm files exist under
  `SEPARATOR_MODEL_DIR` (default
  `~/Library/Application Support/MrMojoRising/separator-models`). The refine
  passes are non-fatal, so the song still completes without them.
- **Tabs never appear** — `venv-sep` must have `basic-pitch` (it's in
  `requirements-separator.txt`); check `BASIC_PITCH_BIN` points at
  `./venv-sep/bin/basic-pitch`. Non-fatal.
- **Imports stay `queued`, never picked up** — the worker isn't running or
  can't reach Turso. Check `launchctl print gui/$(id -u)/com.mrmojorising.worker`
  and the logs; confirm `TURSO_*` values are correct. (This is a Turso
  connectivity issue, *not* a tunnel issue — the tunnel plays no part here.)
- **Jobs get claimed twice / worker status flaps** — two workers are polling
  the same queue. Make sure the old Mac's LaunchAgent is uninstalled after you
  cut over.
- **`cloudflared` won't start** (only if you opted into the tunnel) — create a
  fresh tunnel per step 7; there were no stored credentials to reuse.
- **LaunchAgent runs old code** — the runtime is an rsync'd copy; re-run
  `scripts/install-worker-launch-agent.sh` to sync after edits.
- **pip resolver conflicts** — never install both stacks into one venv; `venv`
  and `venv-sep` are separate on purpose. Rebuild the offending venv from its
  frozen requirements file.
- **Mac sleeps mid-job** — `start.sh` wraps the worker in `caffeinate` while
  running; keep the Mac Mini plugged in and check Energy Saver settings.
