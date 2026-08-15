# Deployment

How to actually run this. Three independent long-lived processes (see
[ARCHITECTURE.md](ARCHITECTURE.md) for how they talk to each other): a
Python FastAPI service, an Express API server, and a Next.js frontend. All
three need to be running — unlike the CLI-per-request model this used to
be, Node no longer has any way to do DSP work without the Python service
reachable.

## 1. Requirements

| | Needed | Why |
|---|---|---|
| Python | 3.12 (matches `backend/venv312`) | DSP engine, chord/clean/codec services |
| Node.js | 18+ | Express API + Next.js build (needs built-in `fetch`/`FormData`/`Blob`) |
| ffmpeg | system binary on `PATH`, with `libmp3lame`, `aac`, `libopus` encoders | format decode on input, mp3 export, codec-preview simulation |
| Disk | ~1.4GB for the Python venv, ~260MB frontend `node_modules`, plus growing upload/output storage (unbounded — see §5) | |
| Internet (first run only) | demucs downloads model weights to `~/.cache/torch`, `~/.cache/demucs`, and `~/.cache/huggingface/hub` the first time stem separation runs; essentia/madmom ship their models with the package | stem separation, chord/key detection |

Verify ffmpeg has what's needed before deploying:
```bash
ffmpeg -encoders 2>/dev/null | grep -iE "libmp3lame|aac|libopus"
```
All three must be present — codec preview (`/codec-preview`) and mp3 export
both depend on them.

## 2. Python backend setup

```bash
cd backend
python3.12 -m venv venv312
source venv312/bin/activate
pip install -r requirements.txt
# madmom needs cython installed first, and --no-build-isolation —
# it doesn't declare its own build dependency correctly:
pip install cython
pip install --no-build-isolation madmom
```

Start the service (stays running — this is the process Node talks to for
every render):
```bash
venv312/bin/python -m uvicorn app.main:app --port 8001
```

Sanity-check it directly before wiring up Node:
```bash
curl http://localhost:8001/health
venv312/bin/python run_adaptive_mastering_cli.py \
  --input /path/to/test.wav --output /tmp/test_master.wav \
  --genre pop --style modern
```
(That CLI script still works standalone, independent of the running
service — same underlying `ai_mastering` code either way. Useful for
isolating whether a problem is in the DSP or in the HTTP plumbing.)

**Process supervision is on you.** Nothing here restarts the FastAPI
process if it crashes or the machine reboots — for production, run it
under systemd, supervisor, pm2, or your platform's equivalent rather than
the bare `uvicorn` command above. A minimal systemd unit:
```ini
[Unit]
Description=AI Mastering Python service
After=network.target

[Service]
WorkingDirectory=/path/to/ai-mastering/backend
ExecStart=/path/to/ai-mastering/backend/venv312/bin/python -m uvicorn app.main:app --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```

## 3. Node backend setup

```bash
cd backend-node
npm install
cp .env.example .env   # then edit as needed — see table below
npm start               # or `npm run dev` for --watch during development
```

Listens on `PORT` (default 8000). Must be started **after** the Python
service is reachable, or every `/master`/`/codec-preview`/`/analyze-chords`/
`/clean` request will fail with a clear "cannot reach Python service"
error (it fails loud, not silently — see §5's note on the ffmpeg fallback
for the one place that isn't true).

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8000` | |
| `CORS_ORIGINS` | `*` | comma-separated if restricting |
| `PYTHON_API_BASE_URL` | `http://localhost:8001` | where the FastAPI service from §2 is reachable |
| `UPLOAD_DIR` | `./uploads` (relative to `backend-node/`) | only used by the legacy ffmpeg-fallback engine now (see below) |
| `OUTPUT_DIR` | `./outputs` | same — everything else's output lives in the Python service's own storage |
| `MAX_UPLOAD_MB` | `200` | |
| `MASTERING_ENGINE` | `adaptive_python` | anything else falls back to the crude in-Node ffmpeg filter chain — see ARCHITECTURE.md §3, don't run production on this |
| `CUSTOM_PRESETS_FILE` | `./custom_presets.json` | user-imported presets, separate from the curated `mixing_presets.json` — resolved entirely in Node, the Python service has no knowledge of these |

If deploying `backend-node` and `backend/` on different machines/
containers, that's fully supported now — they only need `PYTHON_API_BASE_URL`
to resolve to wherever the FastAPI service is reachable, no shared
filesystem required (Node proxies file bytes over HTTP, it never reads the
Python service's storage directly).

## 4. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL to wherever
                              # backend-node actually runs
npm run build
npm start                     # or `npm run dev` locally
```

`NEXT_PUBLIC_API_BASE_URL` is baked in at build time (Next.js
`NEXT_PUBLIC_*` convention) — rebuild after changing it, an env change at
runtime alone won't take effect. Note this only ever points at Node
(port 8000) — the frontend has no reason to know the Python service exists.

## 5. Things that will bite you in production

- **Upload/output storage grows forever.** Nothing deletes old job files —
  every master, every codec preview, every reference track upload stays on
  disk indefinitely, now in the Python service's storage
  (`MASTERING_UPLOAD_DIR`/`MASTERING_OUTPUT_DIR`, see `app/core/config.py`,
  defaults to the repo-root `uploads/`/`outputs/`) rather than Node's. Put
  a cron/lifecycle policy on whichever directory that resolves to before
  this runs unattended for real.
- **Renders are slow and synchronous.** A single `master_track()` call can
  take 30-100+ seconds (longer with stem separation). `/master` blocks the
  whole HTTP request for that duration — there's no job queue, polling, or
  websocket progress. Fine for a single-user/low-traffic deployment; will
  need a real job queue (and the frontend's progress bar switched from
  its current simulated-progress placeholder to real status) before it can
  handle concurrent load. The Python service being warm now (see
  ARCHITECTURE.md §1) removes the *startup* cost per request, not the
  actual DSP processing time — a render is still a render.
- **No auth.** Every endpoint is open — `CORS_ORIGINS=*` by default. Put
  this behind whatever auth/rate-limiting layer matters before exposing it
  publicly; nothing in this codebase does it. This now applies to *two*
  processes if the Python service is ever exposed directly instead of only
  through Node's proxy — don't expose port 8001 publicly, only 8000.
- **`MASTERING_ENGINE` fallback is a trap.** If the Python service in §2
  isn't running and `MASTERING_ENGINE` isn't explicitly `adaptive_python`,
  requests silently succeed via the crude ffmpeg-filter fallback instead of
  failing loud — a much worse master with no error to signal why (this is
  the one place a Python outage degrades instead of failing clearly — every
  other engine path fails with an explicit "cannot reach Python service"
  error). Explicitly set `MASTERING_ENGINE=adaptive_python` in production
  env config rather than relying on the default, and monitor for it.
