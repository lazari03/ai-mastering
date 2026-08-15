# Deployment

How to actually run this. Three independent processes (see
[ARCHITECTURE.md](ARCHITECTURE.md) for how they talk to each other): a
Python environment (no server — CLI scripts invoked per request), an
Express API server, and a Next.js frontend.

## 1. Requirements

| | Needed | Why |
|---|---|---|
| Python | 3.12 (matches `backend/venv312`) | DSP engine, chord/clean/codec services |
| Node.js | 18+ | Express API + Next.js build |
| ffmpeg | system binary on `PATH`, with `libmp3lame`, `aac`, `libopus` encoders | format decode on input, mp3 export, codec-preview simulation |
| Disk | ~1.4GB for the Python venv, ~260MB frontend `node_modules`, plus growing `uploads/`/`outputs/` (unbounded — see §5) | |
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

No server to start here. `backend-node` invokes the interpreter and CLI
scripts directly as subprocesses (see `ADAPTIVE_PYTHON_BIN` below) — as
long as `venv312/bin/python` exists with the packages above importable,
this half of the deployment is done. Sanity-check it directly before wiring
up Node:

```bash
venv312/bin/python run_adaptive_mastering_cli.py \
  --input /path/to/test.wav --output /tmp/test_master.wav \
  --genre pop --style modern
```

## 3. Node backend setup

```bash
cd backend-node
npm install
cp .env.example .env   # then edit as needed — see table below
npm start               # or `npm run dev` for --watch during development
```

Listens on `PORT` (default 8000). All config is env-var driven
(`src/config/settings.js`), everything has a working default relative to
the repo layout except in unusual deployments:

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8000` | |
| `CORS_ORIGINS` | `*` | comma-separated if restricting |
| `UPLOAD_DIR` | `./uploads` (relative to `backend-node/`) | multer destination |
| `OUTPUT_DIR` | `./outputs` | mastered files + codec previews land here |
| `MAX_UPLOAD_MB` | `200` | |
| `MASTERING_ENGINE` | `adaptive_python` | anything else falls back to the crude in-Node ffmpeg filter chain — see ARCHITECTURE.md §3, don't run production on this |
| `ADAPTIVE_PYTHON_BIN` | `../backend/venv312/bin/python` | must point at the venv set up in §2 |
| `ADAPTIVE_CLI_SCRIPT` | `../backend/run_adaptive_mastering_cli.py` | |
| `CHORD_DETECT_CLI_SCRIPT` | `../backend/chord_detect_cli.py` | |
| `CLEAN_AUDIO_CLI_SCRIPT` | `../backend/clean_audio_cli.py` | |
| `PRESET_DSP_CLI_SCRIPT` | `../backend/render_preset_master_cli.py` | |
| `CODEC_PREVIEW_CLI_SCRIPT` | `../backend/codec_preview_cli.py` | |
| `CUSTOM_PRESETS_FILE` | `./custom_presets.json` | user-imported presets, separate from the curated `mixing_presets.json` |

If deploying `backend-node` and `backend/` on different machines/containers,
all the `*_CLI_SCRIPT`/`ADAPTIVE_PYTHON_BIN` paths need to resolve on
whatever machine `backend-node` actually runs on — this architecture
assumes they're on the same filesystem (subprocess spawn, not RPC). Splitting
them across machines isn't supported without changing that.

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
runtime alone won't take effect.

## 5. Things that will bite you in production

- **`uploads/`/`outputs/` grow forever.** Nothing deletes old job files —
  every master, every codec preview, every reference track upload stays on
  disk indefinitely. Put a cron/lifecycle policy on `backend-node/uploads`
  and `backend-node/outputs` before this runs unattended for real.
- **One Python process per request, cold every time.** No model/interpreter
  stays warm — `librosa`, `essentia`, `demucs`, `madmom` all get imported
  fresh per CLI invocation. This is simple and crash-isolated (one bad
  render can't take down a shared server) but costs real per-request
  startup latency (several seconds of import time before any DSP starts) and
  means demucs/madmom/essentia model weights get loaded from disk cache
  every single call, not once. If throughput becomes a problem, the fix is
  a long-lived Python worker process (the FastAPI app in `app/main.py`
  already exists and does this — see ARCHITECTURE.md §1 for why it isn't
  used yet) rather than tuning the current CLI-per-request path further.
- **Renders are slow and synchronous.** A single master_track() call can
  take 30-100+ seconds (longer with stem separation). `/master` blocks the
  whole HTTP request for that duration — there's no job queue, polling, or
  websocket progress. Fine for a single-user/low-traffic deployment; will
  need a real job queue (and the frontend's progress bar switched from
  its current simulated-progress placeholder to real status) before it can
  handle concurrent load.
- **No auth.** Every endpoint is open — `CORS_ORIGINS=*` by default. Put
  this behind whatever auth/rate-limiting layer matters before exposing it
  publicly; nothing in this codebase does it.
- **`MASTERING_ENGINE` fallback is a trap.** If the Python venv setup in §2
  is ever broken or missing on the deploy target and `MASTERING_ENGINE`
  isn't explicitly `adaptive_python`, requests silently succeed via the crude
  ffmpeg-filter fallback instead of failing loud — a much worse master with
  no error to signal why. Explicitly set `MASTERING_ENGINE=adaptive_python`
  in production env config rather than relying on the default, and monitor
  for it.
