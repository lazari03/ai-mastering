# System Architecture

Whole-system view: three processes, how they talk, and where every request
actually goes. For the DSP internals of the mastering engine itself (signal
flow, per-band processing, tier differences), see
[MASTERING_ENGINE.md](MASTERING_ENGINE.md) — this document doesn't repeat
that, it's about everything around it.

## 1. The three processes

```
┌─────────────────┐   HTTP (JSON/multipart)   ┌──────────────────────┐   HTTP (JSON/multipart)   ┌──────────────────────┐
│  frontend/       │ ─────────────────────────▶│  backend-node/       │ ─────────────────────────▶│  backend/             │
│  Next.js 14      │◀───────────────────────── │  Express, port 8000  │◀───────────────────────── │  FastAPI, port 8001   │
│  (browser)       │      responses/files       │                       │      JSON / file bytes     │  long-lived service    │
└─────────────────┘                             └──────────────────────┘                             └──────────────────────┘
```

- **`frontend/`** — Next.js 14 (App Router), client-rendered mastering
  console. Talks to `backend-node/` only, via `fetch` (see
  `src/network/http/client.js`). Nothing here talks to Python directly, and
  nothing here needed to change for the architecture below — Node's public
  request/response shape stayed the same across the switch.
- **`backend-node/`** — Express server on port 8000. The only public HTTP
  API surface. It does no DSP itself — its job is upload handling, request
  validation, resolving which engine/preset a job needs, and forwarding to
  the Python service — plus proxying that service's file responses back
  through so the Python service never needs to be reachable from outside.
  See `src/routes/masteringRoutes.js` for every endpoint.
- **`backend/`** — Python, `app/main.py`, a long-lived FastAPI service
  (`uvicorn app.main:app --port 8001`). Stays running — `librosa`,
  `essentia`, `demucs`, `pedalboard`, and numba's JIT-compiled functions
  are all imported/warmed once at process start, not on every request. Node
  calls it over HTTP (`POST /master`, `/codec-preview`, `/analyze-chords`,
  `/clean`) via `postMultipartToPython()` in `masteringService.js`, and
  proxies its `GET /download`, `/original`, `/download-codec-preview`
  responses straight through to the browser.

  `backend/*_cli.py` (`run_adaptive_mastering_cli.py`,
  `render_preset_master_cli.py`, `chord_detect_cli.py`,
  `clean_audio_cli.py`, `codec_preview_cli.py`) still exist and still work
  standalone — `validate_mastering.py` and direct dev testing use them
  directly — but **Node no longer calls them**. They're thin wrappers
  around the same `ai_mastering`/`app.services` modules the FastAPI routes
  call, so there's one DSP implementation either way, just two ways to
  reach it (a live HTTP service, or a one-shot CLI process) for two
  different purposes (serving requests vs. scripted/manual testing).

This used to be a subprocess-spawn-per-request model — `backend/app/main.py`
existed but Node never called it, and every job paid full Python interpreter
startup + import cost from scratch. That's gone: the two are now genuinely
separate long-lived processes talking HTTP, and starting `backend-node/`
alone will not work — the Python service has to be running too (see
DEPLOYMENT.md §2-3).

## 2. Request lifecycle: a mastering job

```
Browser                Node (Express, :8000)         Python (FastAPI, :8001 — already running)
   │                        │                              │
   │  POST /master          │                              │
   │  (multipart: file,     │                              │
   │   optional reference_  │                              │
   │   file, genre, tags…)  │                              │
   ├───────────────────────▶│                              │
   │                        │ 1. multer receives upload(s)  │
   │                        │    (temp storage only)        │
   │                        │ 2. resolveConfig() resolves    │
   │                        │    genre/style/tags/tier and   │
   │                        │    picks the engine: adaptive  │
   │                        │    / full preset / (legacy     │
   │                        │    ffmpeg fallback)             │
   │                        │ 3. postMultipartToPython(       │
   │                        │    "/master", …) ──────────────▶│
   │                        │                              │ FastAPI route parses
   │                        │                              │ form fields, decodes
   │                        │                              │ input itself (ffmpeg
   │                        │                              │ subprocess), calls
   │                        │                              │ master_track() or
   │                        │                              │ render_preset_master()
   │                        │                              │ in-process, writes
   │                        │                              │ {job}_mastered.{ext}
   │                        │                              │ under its own job_id,
   │                        │                              │ returns JSON
   │                        │◀─────────────────────────────┤
   │  JSON response          │                              │
   │  (analysis, ab_gain_    │                              │
   │   match, download_url  │                              │
   │   — job_id is the one  │                              │
   │   Python generated)    │                              │
   │◀───────────────────────┤                              │
   │                        │                              │
   │  GET /download/         │                              │
   │  {job_id}.wav            │                              │
   ├───────────────────────▶│ 4. proxyFromPython() fetches   │
   │                        │    the file from FastAPI and  │
   │                        │    streams it straight back ──▶│
   │  file bytes              │◀───────────────────────────┤
   │◀───────────────────────┤                              │
```

Every other endpoint (`/codec-preview`, `/clean`, `/analyze-chords`) follows
the same shape: Node forwards the multipart request to the matching FastAPI
route via `postMultipartToPython()`, gets JSON back, returns it — no local
file writes, no subprocess spawn, no per-request Python startup cost.
File-serving routes (`/download`, `/original`, `/download-codec-preview`)
proxy the bytes from FastAPI's storage through `proxyFromPython()`.

## 3. Two mastering engines, chosen per-request

`resolveConfig()` in `masteringService.js` still resolves genre/style/tags/
tier/preset exactly as before — that logic didn't move to Python, so
Node's custom-presets feature (`custom_presets.json`, Python has no
knowledge of it) keeps working unchanged. What changed is only how the
resolved job reaches Python:

| Request shape | Engine | How it's invoked |
|---|---|---|
| genre + tags + tweaks (the normal case) | Adaptive DSP engine | `POST /master` on the FastAPI service, resolved fields as form data |
| `mix_preset` that has a `processing` block | Preset DSP engine (literal spec interpreter) | Same route — Node sends the resolved preset dict as `full_preset_json` so Python doesn't need to know about Node's own curated/custom preset files |
| (fallback, `MASTERING_ENGINE` env ≠ `adaptive_python`) | Legacy ffmpeg `-af` filter chain, built in Node itself | none — no Python involved, still fully local to Node (`processMasteringViaFfmpegFallback()`) |

The third path exists for environments without the Python service running
at all; it's a much cruder approximation (see `buildFilterChain()` in
`masteringService.js`) and isn't what any real deployment should run on —
and unlike before, it's now also the *only* path that still writes to
Node's own local `uploads`/`outputs` directories, since the other two
delegate storage to the Python service entirely. Default is always the
adaptive Python engine, which now **requires** the FastAPI service to be
reachable — there's no CLI-subprocess fallback if it isn't (see
DEPLOYMENT.md §5's note on why that's a deliberate choice, not an
oversight).

## 4. Filesystem layout (storage is now split by process, not shared)

```
ai-mastering/
├── uploads/, outputs/              ← repo-root copies — test fixtures for
│                                      validate_mastering.py / manual CLI
│                                      testing, unrelated to the running app
├── backend-node/
│   ├── uploads/                    ← settings.uploadDir — only used by the
│   │                                  legacy ffmpeg-fallback engine now;
│   │                                  multer's own temp storage lives
│   │                                  elsewhere (OS tmp dir) for everything
│   │                                  that gets forwarded to Python
│   └── outputs/                    ← only written to by the ffmpeg-fallback
│                                      engine — everything else's output
│                                      lives in the Python service's own
│                                      storage, proxied through on request
├── backend/
│   ├── ai_mastering/                ← adaptive engine package
│   ├── app/
│   │   ├── main.py                 ← the live FastAPI service (see §1)
│   │   ├── core/config.py          ← MASTERING_UPLOAD_DIR/MASTERING_OUTPUT_DIR
│   │   │                              — defaults to repo-root uploads/outputs,
│   │   │                              a *different* directory than Node's
│   │   │                              own uploads/outputs above. This is
│   │   │                              fine — Node and Python never share a
│   │   │                              filesystem path, only an HTTP contract,
│   │   │                              so there's nothing to keep in sync.
│   │   └── services/                ← preset engine, codec preview, chord/
│   │                                  clean services — imported by both the
│   │                                  FastAPI routes and the standalone CLI
│   │                                  scripts
│   ├── *_cli.py                    ← standalone entry points (validate_
│   │                                  mastering.py, dev testing — not
│   │                                  called by Node anymore, see §1)
│   ├── params.py                   ← genre/style/tag profile data
│   ├── mixing_presets.json         ← built-in preset library
│   └── venv312/                    ← the Python interpreter the FastAPI
│                                      service runs under
└── frontend/
```

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

## 7. Auth (Firebase)

Every route requires a signed-in user except `GET /health` (open for load
balancers/uptime monitors). Firebase was chosen as the identity provider —
this repo doesn't run its own user database or session store.

```
Browser                         Node (Express, :8000)          Firebase
   │                                   │                            │
   │  sign in (email/password or       │                            │
   │  Google popup) ───────────────────┼───────────────────────────▶│
   │◀──────────────────────────────────┼──── ID token ──────────────┤
   │                                   │                            │
   │  any API call, e.g. POST /master  │                            │
   │  Authorization: Bearer <idToken>  │                            │
   ├──────────────────────────────────▶│                            │
   │                                   │ requireAuth middleware:     │
   │                                   │ verifyIdToken() ───────────▶│
   │                                   │◀──── decoded claims ────────┤
   │                                   │ req.user = {uid, email}     │
   │                                   │ → route handler runs        │
   │◀──────────────────────────────────┤                            │
```

- **Frontend** (`frontend/src/lib/firebase.js`, `store/authStore.js`) —
  Firebase's client SDK handles sign-up/sign-in/session persistence
  entirely client-side; Node never sees a password. `network/http/client.js`
  attaches the current user's ID token to every request automatically —
  none of the individual API functions (`postMaster`, `getGenres`, etc.)
  know auth exists.
- **Backend** (`backend-node/src/middleware/auth.js`,
  `config/firebase.js`) — Firebase Admin SDK verifies the token
  server-side (signature, expiry, project match) using a service account
  credential that never reaches the browser. Mounted globally in
  `server.js` ahead of `masteringRoutes.js`.
- **The Python service knows nothing about auth.** It's not
  internet-facing (see §1) — Node is the only thing that talks to it, and
  Node has already authenticated the request by the time it forwards
  anything. Adding auth there too would be redundant, not defense in depth.
- **Firebase Auth is browser-only** — it needs `window`/`localStorage` for
  session persistence, but Next.js still server-renders `"use client"`
  modules during the build/SSR pass. `lib/firebase.js` guards every
  Firebase call behind a `typeof window !== "undefined"` check and
  lazy-initializes on first real (browser) use — importing the module
  anywhere, server-side or not, never triggers actual initialization. This
  isn't optional: the eager version crashes the entire `next build`,
  including pages that don't use auth, the moment the module is imported
  from the root layout.

Setup steps (creating the Firebase project, enabling sign-in providers,
getting credentials) are in [FIREBASE_SETUP.md](FIREBASE_SETUP.md) — that
part has to happen in the Firebase console, not from code.
