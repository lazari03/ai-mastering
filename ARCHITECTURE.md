# System Architecture

Whole-system view: three processes, how they talk, and where every request
actually goes. For the DSP internals of the mastering engine itself (signal
flow, per-band processing, tier differences), see
[MASTERING_ENGINE.md](MASTERING_ENGINE.md) — this document doesn't repeat
that, it's about everything around it.

## 1. The three processes

```
┌─────────────────┐      HTTP (JSON/multipart)      ┌──────────────────────┐
│  frontend/       │ ───────────────────────────────▶│  backend-node/       │
│  Next.js 14      │◀─────────────────────────────── │  Express, port 8000  │
│  (browser)       │         responses/files          │                       │
└─────────────────┘                                   └──────────┬────────────┘
                                                                   │ spawns a
                                                                   │ subprocess
                                                                   │ per request
                                                                   ▼
                                                        ┌──────────────────────┐
                                                        │  backend/             │
                                                        │  Python, no server —  │
                                                        │  CLI scripts run and  │
                                                        │  exit, one per job    │
                                                        └──────────────────────┘
```

- **`frontend/`** — Next.js 14 (App Router), client-rendered mastering
  console. Talks to `backend-node/` only, via `fetch` (see
  `src/network/http/client.js`). Nothing here talks to Python directly.
- **`backend-node/`** — Express server on port 8000. This is the only HTTP
  API surface. It does no DSP itself — its job is upload handling, request
  validation, spawning the right Python CLI script per job, and ffmpeg
  container/format conversion (decode-on-input, wav↔mp3 on output). See
  `src/routes/masteringRoutes.js` for every endpoint.
- **`backend/`** — Python. **Not a running server** in the live path — no
  process listens on a port here. `backend/app/main.py` is a FastAPI app
  that exists and works, but Node never calls it over HTTP; Node instead
  shells out to standalone CLI scripts (`run_adaptive_mastering_cli.py`,
  `render_preset_master_cli.py`, `chord_detect_cli.py`, `clean_audio_cli.py`,
  `codec_preview_cli.py`), each of which does one job, prints a JSON result
  to stdout, and exits. One Python process per request, not a long-lived
  service.

This means: to add a new Python-side capability reachable from the API, you
add a CLI script (thin argparse wrapper, JSON to stdout — see any existing
one for the pattern) and a `settings.js` path pointing at it, not a new
FastAPI route. The FastAPI app is a second, currently-unused way to reach
the same underlying service modules — kept in sync because it imports the
same `ai_mastering`/`app.services` code, not because it's deployed.

## 2. Request lifecycle: a mastering job

```
Browser                Node (Express)              Python (CLI, one-shot)
   │                        │                              │
   │  POST /master          │                              │
   │  (multipart: file,     │                              │
   │   optional reference_  │                              │
   │   file, genre, tags…)  │                              │
   ├───────────────────────▶│                              │
   │                        │ 1. multer saves upload(s)    │
   │                        │    to uploads/               │
   │                        │ 2. ffmpeg decode-if-needed    │
   │                        │    (m4a/mp3/etc → wav)        │
   │                        │ 3. resolveConfig() picks the  │
   │                        │    engine: adaptive / preset  │
   │                        │    / (legacy ffmpeg fallback) │
   │                        │ 4. spawn python CLI ──────────▶│
   │                        │                              │ master_track()
   │                        │                              │ or
   │                        │                              │ render_preset_master()
   │                        │                              │ writes {job}_mastered.wav,
   │                        │                              │ prints JSON to stdout
   │                        │◀─────────────────────────────┤
   │                        │ 5. parseJsonFromStdout()      │
   │                        │ 6. ffmpeg wav→mp3 if           │
   │                        │    output_format=mp3          │
   │  JSON response          │                              │
   │  (analysis, ab_gain_    │                              │
   │   match, download_url) │                              │
   │◀───────────────────────┤                              │
```

Every other endpoint (`/codec-preview`, `/clean`, `/analyze-chords`) follows
the same shape: Node stages files, spawns one CLI script, parses its stdout
JSON, does any ffmpeg container conversion, returns JSON + a download URL.

## 3. Two mastering engines, chosen per-request

`resolveConfig()` in `masteringService.js` decides which engine a request
hits, based on what was submitted — not a global server setting:

| Request shape | Engine | CLI script |
|---|---|---|
| genre + tags + tweaks (the normal case) | Adaptive DSP engine | `run_adaptive_mastering_cli.py` |
| `mix_preset` that has a `processing` block | Preset DSP engine (literal spec interpreter) | `render_preset_master_cli.py` |
| (fallback, `MASTERING_ENGINE` env ≠ `adaptive_python`) | Legacy ffmpeg `-af` filter chain, built in Node itself | none — no Python involved |

The third path exists for environments without the Python backend
available at all; it's a much cruder approximation (see
`buildFilterChain()` in `masteringService.js`) and isn't what any real
deployment should run on. Default is always the adaptive Python engine.

## 4. Filesystem layout (why uploads/outputs are duplicated)

```
ai-mastering/
├── uploads/, outputs/              ← repo-root copies (older layout, still
│                                      present on disk, gitignored)
├── backend-node/
│   ├── uploads/                    ← settings.uploadDir default — where
│   │                                  multer actually saves incoming files
│   └── outputs/                    ← settings.outputDir default — where
│                                      {job}_mastered.* and codec previews land
├── backend/
│   ├── ai_mastering/                ← adaptive engine package
│   ├── app/
│   │   ├── main.py                 ← unused FastAPI app (see §1)
│   │   └── services/                ← preset engine, codec preview, chord/
│   │                                  clean services — imported by both the
│   │                                  CLI scripts and the unused FastAPI app
│   ├── *_cli.py                    ← the actual live entry points
│   ├── params.py                   ← genre/style/tag profile data
│   ├── mixing_presets.json         ← built-in preset library
│   └── venv312/                    ← the Python interpreter Node actually
│                                      invokes (ADAPTIVE_PYTHON_BIN)
└── frontend/
```

Two upload/output directories exist because of the repo's history — only
`backend-node/uploads` and `backend-node/outputs` are live (everything in
`settings.js` defaults there). The repo-root `uploads/`/`outputs/` are
leftover/manually-populated test fixtures used for `validate_mastering.py`
runs and ad-hoc backend testing; they're not written to by the running
Node/Python pipeline. Don't be surprised finding audio in both places — only
one of them is what the app itself writes to.

## 5. Frontend structure

```
frontend/src/
├── app/ui/MasteringConsole.jsx      ← the whole mastering screen
├── store/masteringStore.js          ← zustand store: all UI state + submit()
├── domain/mastering/masteringDomain.js  ← one layer down: shapes API calls/
│                                          responses, decoupled from fetch details
├── network/http/client.js           ← the only file that knows the API base
│                                       URL and does actual fetch() calls
└── components/audio/
    ├── SignalVisualizer.jsx         ← waveform+spectrum player, used for
    │                                  original/mastered/codec-preview audio
    ├── liveMasteringEngine.js       ← client-side Web Audio approximation
    │                                  for instant slider feedback — NOT
    │                                  connected to the real render, purely
    │                                  so tweaks sound different before you
    │                                  submit
    └── ProcessingSummary.jsx        ← renders whatever processing_applied/
                                        analysis_before/after the API returned
```

Data flow is one-directional and layered: `client.js` (raw HTTP) →
`masteringDomain.js` (shape/normalize) → `masteringStore.js` (state) →
components (render). A component never calls `client.js` directly.

## 6. Dead code removed

`backend/chain.py` — a standalone ffmpeg filter-chain builder
(`build_filter_chain()`), imported from nowhere in the live path
(`app/services/`, the CLI scripts, and `masteringService.js` each have
their own independent EQ/filter logic). Looked like an earlier iteration of
what `buildFilterChain()` in `masteringService.js` now does natively in
Node. Confirmed via grep across the whole project (matches outside
`chain.py` itself were all in `venv312/`'s third-party packages, not this
codebase) and deleted during the refactor pass.
