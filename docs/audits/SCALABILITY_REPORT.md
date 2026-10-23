# Scalability report: mastering job path and capacity

| | |
|---|---|
| Date | 2026-10-15 |
| Commit | `e441297` (evidence line numbers are taken from `git show e441297:<file>`; the working tree had other agents' uncommitted edits during this audit) |
| Author | performance-engineer |
| Scope | Python DSP service (`backend/app/core/*`, `backend/app/api/routes/mastering.py`, `backend/app/services/mastering_service.py`), Node gateway (`masteringService.js`, `pythonUpstream.js`, `masteringRoutes.js`), `docker-compose.yml`. Capacity model for 100 / 1,000 / 10,000 active users. |
| Tools | `run_adaptive_mastering_cli.py` wrapped in a Python harness (`resource.getrusage(RUSAGE_CHILDREN)` for peak RSS and CPU time; `/usr/bin/time` is not installed here), `tests/synthetic.make_mix`, Erlang-C queueing formula. No load was sent to production. |
| Prior evidence | `docs/audits/RESOURCE_BENCHMARKS.md` (worker-path measurements, Demucs, cost model). Reused, not duplicated. |

**Labels.** **MEASURED** means a command was run on the hardware stated. **MODELED** means a formula plus stated assumptions. **ESTIMATE** means a rough market price, not checked against any invoice or current price list. No user count in this report is *supported*. Each figure is a model output to check against production `/capacity` telemetry.

---

## 1. Measured results

**Hardware (MEASURED, `nproc`, `free -m`, `lscpu`):** cloud container, 4 vCPU Intel Xeon @ 2.10 GHz, 16,093 MB RAM, no swap, Python 3.12.3 (`/home/user/venv-auralith`). **This is not the production VPS.** The production VPS size is not recorded anywhere in the repo (searched `docs/`, `README.md`, the KB). The VPS also runs Node, Next.js, Caddy and dozzle, while this container ran nothing else.

**Input:** `make_mix(seconds=N, seed=1)`, 44.1 kHz stereo, 24-bit WAV, `--genre pop`. **Path:** `run_adaptive_mastering_cli.py`, which calls `master_track` directly. This path does **not** include upload staging, the ffmpeg decode of compressed input, delivery verification, the browser-preview transcode or the forkserver worker. It **does** include about 2–4 s of interpreter and import start-up. Each job ran in its own process.

Command: `python run.py <label> <tier> <input>...` from the scratchpad. It starts N CLI processes at once and reports per-job wall time, CPU time (user+sys) and `ru_maxrss`.

| Run | Audio | Tier | Concurrency | Wall per job | CPU per job | Peak RSS per job | Wall ÷ audio |
|---|---|---|---|---|---|---|---|
| s30 | 30 s | Standard | 1 | 13.3 s | 15.5 s | 431 MB | 0.44 |
| s180 | 180 s | Standard | 1 | 75.8 s | 81.6 s | 1,177 MB | 0.42 |
| p180 | 180 s | Professional | 1 | 119.2 s | 125.0 s | 1,238 MB | 0.66 |
| c3x180 | 180 s | Standard | 3 | 98.3–98.9 s (batch 99.0 s) | 95.7–99.1 s | 1,177–1,178 MB | 0.55 |
| c4x180 | 180 s | Standard | 4 | 112.7–112.9 s (batch 112.9 s) | 100.1–100.9 s | 1,177–1,178 MB | 0.63 |

What the runs show:
* **A job uses about one core.** CPU ÷ wall is 1.08 for a single job. Rendering is mostly single-threaded, so concurrency rather than core speed sets throughput.
* **Throughput on 4 vCPU** (audio-seconds mastered per wall-second): 2.4 at c=1, **5.45 at c=3** (the default cap), 6.38 at c=4. Going from 3 to 4 slots adds only +17 %, and CPU per job rises from 82 s to 100 s, which points to memory-bandwidth or cache contention.
* **Professional takes 1.57× the time of Standard** (119.2 ÷ 75.8) for about the same memory.
* **Memory is consistent with the admission cost model** (`450 + 310 × min` gives 1,380 MB at 3 min, against 1,177 MB measured). The model is about 17 % conservative, which is the intended direction.
* **Comparison with `RESOURCE_BENCHMARKS.md`:** the worker path was 0.55 wall-s per audio-s (4 min in 131 s). The CLI here is faster at 0.42 because it omits decode, delivery, preview and staging. DSP code has changed since that audit (commit 86b83c8). For planning, this report uses the **worker-path rate of 0.55 s/s** with the **contention factor measured here** (98.7 ÷ 75.8 = **1.30** at c=3), giving **0.72 s/s per job at 3 concurrent**.

Not measured in this session: production hardware, the full HTTP path under concurrency, Demucs (reused from `RESOURCE_BENCHMARKS.md`: htdemucs_ft takes 2.33× realtime, 3.4 cores and ~2.8 GB at 3.6 min), upload bandwidth, and disk I/O.

---

## 2. Architecture of the job path (as of `e441297`)

```
Browser ──(one HTTP POST, held open up to 20 min: frontend client.js:5)──► Caddy (reverse_proxy, no explicit timeout)
  ► Node /master (masteringRoutes.js:731)
      expensiveLimiter 20 req / 15 min per uid-or-IP (rateLimit.js:35-37)
      multer → disk, 200 MB cap (masteringRoutes.js:92)
      reservation written to Firestore (ledger; lease 25 min, reservationLedger.js:33)
      fs.readFileSync(whole upload) → Blob → streamed multipart (masteringService.js:201)   ← AURALITH-BACKEND-004
      postFormData, single deadline 19 min (pythonUpstream.js:21)
  ► Python /master — sync `def` route on AnyIO thread pool (mastering.py:189)
      stage: file.file.read() whole upload into the server process, write to /app/uploads (mastering_service.py:419)
      ffprobe duration / sample rate; refuse >15 min (config.py) and stems > 6 min
      ResourceGovernor.admit (mastering.py:285, job_runner.py:176-213):
          running < 3 jobs (config.py:104) AND reserved est. MB + job ≤ budget AND stems < 1 (config.py:107)
          else FIFO queue ≤ 6 (config.py:108), wait ≤ 120 s (config.py:109) → 503 at_capacity / queue_timeout + Retry-After
      run_in_worker: forkserver process, own process group, SIGKILL at deadline
          deadline = min(1080 s, caller deadline − 30 s) (config.py:110, mastering.py:59)
      response JSON only when the render is finished (no progress, no job polling for the result)
```

**Answers to the brief:**
* **Is a synchronous HTTP request held open up to the 19-min gateway deadline?** Yes. Every hop (browser → Caddy → Node → Python) holds one connection for the full render. There is no asynchronous job API. `GET /jobs/{id}` exists on Python but only returns state, not the result.
* **Is there a queue?** Only an **in-memory, in-process** bounded FIFO inside the Python service: 6 places and 120 s wait (`job_runner.py:140-213`). It is not durable, not shared between processes, and lost on restart.
* **Is there admission control?** Yes. It is memory-aware and count-capped, which is good. The budget comes from the cgroup limit × 0.75, or else host RAM × 0.5 (`job_runner.py:77-91`). No compose service has a memory limit (AURALITH-DEVOPS-001), so in production the budget is **half of host RAM**. The service runs as **one uvicorn process** (`backend/Dockerfile:47`), so the governor is correct, but adding `--workers N` would multiply the budget N times. Horizontal scaling therefore needs a queue (section 4).
* **Previews share the same slots.** 30 s free previews go through the same `/master` path and governor (`masteringRoutes.js:731` with `preview=true`). A preview holds one of the 3 slots for about 13–17 s.
* **Python `/analyze` runs outside the governor.** It decodes and analyses on the server thread pool with no concurrency cap of its own (`mastering.py:122`, `mastering_service.py:569-597`). Only Node's per-user rate limit bounds it.

---

## 3. Capacity model (MODELED)

### 3.1 Assumptions (explicit; change these first)

| # | Assumption | Base value | Why |
|---|---|---|---|
| A1 | Active user | Monthly active user (signed in at least once in the month) | — |
| A2 | Full masters per active user per day | **0.33** (~10 per month) | Between the free trial (3 lifetime) and Indie (15 per month); most MAU are not at quota |
| A3 | 30 s previews per active user per day | **1.0** | Previews are free and unlimited (PRODUCT_RULES) |
| A4 | Professional share of full masters | 20 % (×1.57 time, MEASURED) | Studio and All-Access only |
| A5 | Stem jobs | 3 % of full masters | Paid add-on or All-Access only |
| A6 | Peak-hour fraction of daily jobs | **12 %** (a flat 24 h would be 4.2 %) | Audience concentrated in one region (en + sq) |
| A7 | Average track length | **3.5 min** (210 s) | Typical song |
| A8 | Render time per audio-second at c=3 | **0.72 s** (0.55 worker-path × 1.30 measured contention) | Section 1 |
| A9 | RAM per job (admission estimate) | 450 + 310 × 3.5 = **1,535 MB**; stem +3,700 MB | `config.py:111-113`; measured 1,177 MB at 3 min |
| A10 | Disk kept per full master (48 h retention) | ~150 MB: input 37–55 MB (or MP3 + 74 MB float `_internal.wav`), 24-bit output 55 MB, 16-bit preview 37 MB | `ai_mastering/mastering.py:517` PCM_24; `mastering_service.py:250,544` |
| A11 | Disk kept per preview | ~24 MB (30 s float input, 24-bit output, preview) | — |
| A12 | Acceptable service | ≤2 % of jobs wait longer than the 120 s queue cap (which returns a 503 to the user) | Queue bound `config.py:109` |
| A13 | Slot = one concurrent worker; 3 slots per 4 vCPU | MEASURED: c=3 is the knee (+17 % for c=4) | Section 1 |

### 3.2 Formulas

```
slot_s_per_master  = L × r × (1 − p_pro + p_pro × 1.57)        = 210 × 0.72 × 1.114 ≈ 168.5 s
slot_s_per_preview = 30 s × 0.44 s/s × 1.30                       ≈ 17 s
peak_slot_s_per_user_hour = f_peak × (m × slot_s_per_master + v × slot_s_per_preview)
                          = 0.12 × (0.33 × 168.5 + 1.0 × 17)      ≈ 8.7 slot-seconds per user in the peak hour
offered load a (Erlangs) = U × 8.7 / 3600
slots needed c  = smallest c with  ErlangC(c, a) × exp(−(c − a) × 120 / S) < 0.02     (M/M/c, S = 168.5 s)
RAM_needed      = c × 1,535 MB + n_stem × 5,235 MB (+ ~2 GB for Node/Next/Caddy)
disk_retained   = U × (m × 150 MB + v × 24 MB) × 2 days
peak_bandwidth  = U × f_peak × m × (upload ~50 MB + downloads ~90 MB) / 3600 s
```

Mixing previews and masters into one average service time S is a simplification. A real mix has higher variance, and therefore longer tails, so the slot counts below are a floor.

### 3.3 Results

| | 100 users | 1,000 users | 10,000 users |
|---|---|---|---|
| Peak-hour jobs (masters + previews) | 4 + 12 = **16 /h** | 40 + 120 = **160 /h** | 400 + 1,200 = **1,600 /h** |
| Offered load a | 0.24 Erlang | 2.42 Erlang | 24.2 Erlang |
| Utilisation on today's 3 slots | 8 % | **81 %**: mean wait ≈ 191 s, P(wait > 120 s) ≈ **44 %** → many 503 `queue_timeout` | impossible (ρ ≫ 1) |
| Slots needed (A12) | 2 (3 exist) | **5** | **29** (only if pooled in one shared queue) |
| CPU (3 slots per 4 vCPU) | 4 vCPU | ~7–8 vCPU | ~39–40 vCPU of workers |
| RAM for workers (+ 1 stem slot each box) | 4.6 GB (+5.2 stem) | 7.7 GB + 5.2 GB ≈ 13 GB → a **32 GB host** with the auto ×0.5 budget, or an explicit budget | ~45 GB + stems ≈ 55–65 GB across boxes |
| Disk retained (48 h) | **~15 GB** | **~147 GB** | **~1.5 TB** |
| Peak-hour transfer, full masters only | ~1.2 Mbit/s | ~12 Mbit/s | ~125 Mbit/s (plus previews and playback) |
| Stem slot (1 per box, serialized; ~640 slot-s per 3.5-min stem job) | ρ ≈ 2 % | ρ ≈ **21 %** (stem waits begin; Demucs uses 3.4 cores, so it slows every other slot on its box) | ρ ≈ 211 % on one slot → needs ≥ 4 pooled stem slots |
| Verdict (MODELED) | One 4 vCPU / 16 GB box has headroom. Risks are bursts (>9 simultaneous submits → instant 503) and the unknown VPS size. | Today's single box is **over capacity at peak** on CPU slots and **at or over typical VPS disk**. | Needs a shared queue, multiple worker boxes and object storage. |

### 3.4 First bottleneck

**The fixed pool of 3 concurrent render slots on one Python process, used by both paid masters and free previews, behind a 6-place / 120 s in-memory queue.** Under the base assumptions it saturates at about **750 active users** (ρ = 0.6, where P(wait > 120 s) is already about 10 %). Past that point users get 503s, not slow service. Holding a synchronous HTTP connection open does not cap throughput by itself, but it rules out queueing longer than 120 s.

The second wall is **disk** at roughly 1,000 users: about 150 GB kept under 48 h retention. There is no free-space check (section 5).

**Production caveats:**
1. If the production VPS has **8 GB RAM**, the auto budget is 4 GB. Then 2 slots (not 3) for 3.5-min tracks is the limit, and **every stem job is refused 413 `too_large_for_server`**, because even a 30 s stem job is estimated at 4,460 MB against a 4,096 MB budget (`job_runner.py:180-185`).
2. The VPS also hosts Node, Next.js and Caddy, and the measurement container did not. Expect lower throughput per slot than measured here.

Check by reading `GET /capacity` on the VPS (budget, budget source, running, queued).

---

## 4. Incremental scaling path

Each step is triggered by a measured signal, not by a user count. Costs are monthly **ESTIMATES** (typical European VPS/cloud list-price ranges, not verified against current price lists or the real invoice).

| Step | Trigger (measure it) | Change | Approx. headroom (MODELED) | Cost **ESTIMATE** / month |
|---|---|---|---|---|
| 0. Configure what exists | Now | Set `mem_limit` on python-service and an explicit `MASTERING_MEMORY_BUDGET_MB` (AURALITH-DEVOPS-001). Add a disk-usage alarm and log rotation (DEVOPS-006). Record the VPS size in the KB. Delete `_internal.wav` after render (section 5). | ~500–750 users on 4 vCPU / 16 GB | €0 extra (box €15–40) |
| 1. Bigger VPS | Peak `queued > 0` often, or any `queue_timeout` 503s; disk > 60 % | 8 vCPU / 32 GB. `MAX_CONCURRENT_JOBS=6`, budget ~20 GB, `QUEUE_MAX` ~12. Reserve 1–2 slots for paid masters, or give previews their own small cap, so free previews cannot starve paid jobs. Disk ≥ 250 GB, or 24 h retention for previews. | ~1,200–1,500 users | €40–100 |
| 2. Split Python onto its own box(es) | CPU on the shared box > 70 % at peak; Node/frontend latency affected by renders | python-service on a dedicated 8–16 vCPU box; Node/frontend/Caddy on a small box. Several Python boxes need capacity-aware routing in Node (read `/capacity` and pick a box), because each governor only knows its own box. | ~2,000–3,000 users with 2 worker boxes | €60–250 |
| 3. Durable queue and async jobs | Need for > 120 s queueing, stems on tracks > 6 min, or > 2 worker boxes | Node enqueues the job (Redis/BullMQ or a Firestore jobs collection) and returns `202 {job_id}`. The client polls or uses SSE. N workers pull jobs, each with the existing governor and worker code. This pools slots (29 pooled slots versus far more for independent boxes), removes the 19-min held connections, the 6-min stem cap and the restart-loses-job problem. | ~10,000 users with ~5 × 8 vCPU / 32 GB workers | €200–600 (workers) + €0–30 (queue) |
| 4. Object storage | Disk retained > ~150 GB, or > 1 worker box needs the files | Browser uploads straight to S3-compatible storage with presigned URLs, which removes Node buffering (AURALITH-BACKEND-004) and two of the three local copies. Workers read and write the bucket. A 48 h lifecycle rule replaces `storage_cleanup.py`. | Disk no longer limits | €10–50 for ~1.5–2 TB, plus egress of about €0–900 for ~10 TB per month at 10k users (from "included traffic" to €0.09/GB, depending on provider) |

Order: 0 → 1 first, because they are cheapest and use the existing compose. Steps 2–4 are product-owner decisions (new services, cost). Do not adopt a new platform before step 1 has been measured on the real VPS.

---

## 5. Resilience gaps

Existing KB issues are referenced, not restated. **NEW** marks a gap not in `KNOWN_ISSUES.json` at the time of writing. All line numbers are at `e441297`.

| # | Scenario | Current behaviour (evidence) | Gap | KB |
|---|---|---|---|---|
| R1 | Worker crash / OOM kill | Handled. A dead worker gives `JobTerminated("crashed")` → 500 `worker_crashed`, the job's files are removed and Node refunds (`job_runner.py:382-409`, `mastering.py:294-297`, `masteringRoutes.js:1146`). | No limit on python-service, so a host-level OOM can kill uvicorn, Node or Caddy rather than the worker. | AURALITH-DEVOPS-001 |
| R2 | Python service restarts mid-job (deploy, crash) | In-flight workers die with the container. Node sees a socket error and refunds; the leftover reservation is settled by the 5-min reconciler (`server.js:221-231`). `JobRegistry` is in memory only (`job_runner.py:244-248`). | No drain: `docker compose up -d --build` (`Makefile:73`) recreates the container with the default 10 s stop grace (no `stop_grace_period` in `docker-compose.yml`), so every deploy at peak kills up to 3 renders plus 6 queued. Interrupted jobs are not resumed; the user must re-upload. | AURALITH-DEVOPS-002 (deploy); **NEW** (no drain/resume) → AURALITH-PERF-003 |
| R3 | Node restarts mid-job | Python keeps rendering for a client that has gone. The result is discarded and the files are kept until the sweep. The reservation reconciler only calls `cancelPythonJob` after the 25-min lease expires (`masteringRoutes.js:69-72`, `reservationLedger.js:33`), which is later than the 18-min job deadline. | An orphaned render holds a slot and up to ~5 GB until it completes. Python does not notice the client disconnecting (sync route). | **NEW** → AURALITH-PERF-003 |
| R4 | Temp files after a successful render | For compressed uploads, the float decode `<job>_input_internal.wav` (`mastering_service.py:250`) is **never deleted** after the render. The comment at `mastering_service.py:259` says it is, but `render_staged_job` (`:470-561`) has no unlink. It stays 48 h: about +74 MB per 3.5-min MP3 job. | Disk waste, and a full 32-bit copy of user audio kept beyond its use. | **NEW** → AURALITH-PERF-002 |
| R5 | Temp files after a killed job | Demucs writes to `tempfile.TemporaryDirectory` in the container's `/tmp` (`ai_mastering/stem_separation.py:49`). A SIGKILL at the deadline or on cancel (`job_runner.py:418-425`) skips its cleanup, and `storage_cleanup.py` only sweeps the top-level files of uploads and outputs (`storage_cleanup.py:23-47`). | Stem WAVs build up in the container's writable layer until it is recreated. | **NEW** → AURALITH-PERF-002 |
| R6 | Disk full | No free-space check before staging (`mastering_service.py:417-419`) or rendering. ENOSPC surfaces as a generic 500. Cleanup is by age only. Three copies of each upload exist at once: Node multer dir, Python uploads, decoded WAV. | At about 1,000 users, 48 h retention approaches typical VPS disk sizes (section 3). A full disk also breaks deploys (`Makefile` comment, 2026-08-26 incident) and SQLite analytics. | AURALITH-DEVOPS-006/-007 (no disk cap, monitoring); **NEW** detail → AURALITH-PERF-002 |
| R7 | Memory outside the governor | Node: whole upload held in memory per request (AURALITH-BACKEND-004). Python: `stage_mastering_request` also does `file.file.read()` of the whole upload in the **server** process, before admission (`mastering_service.py:419`), as does `/analyze` (`:583`), which decodes and analyses with no cap (`mastering.py:122`). | The governor's budget only covers workers. Uploads of 200 MB at the same time and `/analyze` bursts add unbudgeted RSS to the server process. | AURALITH-BACKEND-004 (Node); **NEW** (Python side) → AURALITH-PERF-003 |
| R8 | Burst at the queue bounds | More than 9 simultaneous submits (3 running + 6 queued) get an instant 503 `at_capacity`. Queued jobs get a 503 after 120 s. Nothing is charged. Node drops Retry-After (AURALITH-BACKEND-005). | Correct fail-fast behaviour, but the user sees an error, not a wait. Only step 3 (async queue) fixes this. | AURALITH-BACKEND-005; AURALITH-PERF-001 |
| R9 | Slow client upload | Node 22's default `server.requestTimeout` is 300 s and `server.js` does not override it (no matches for `requestTimeout`). Caddy streams the request body through. | **Likely, not measured:** a 200 MB upload slower than ~5.3 Mbit/s would be cut off by Node. This matters on mobile or home uplinks with large WAVs. | **NEW** (unverified) → noted in AURALITH-PERF-001 |

---

## 6. Findings filed

| ID | P | Title |
|---|---|---|
| AURALITH-PERF-001 | P2 | Capacity: 3 render slots shared by paid masters and free previews, one process, 120 s in-memory queue. Modeled saturation at about 750 MAU (base assumptions) |
| AURALITH-PERF-002 | P2 | Disk: `_internal.wav` never deleted after render; Demucs `/tmp` left behind on SIGKILL; no free-space guard. 48 h retention reaches ~150 GB at about 1,000 MAU |
| AURALITH-PERF-003 | P2 | Resilience: renders orphaned after a Node restart run until done (lease 25 min > deadline 18 min); no drain on deploy; Python stage and `/analyze` buffer whole uploads outside the governor |

## 7. Re-measure on production (safe, read-only or off-peak)

```
curl -s localhost:8001/capacity                    # budget_mb, budget_source, running, queued, cost_model
nproc; free -m; df -h /var/lib/docker              # record the VPS size in the KB
docker stats --no-stream                           # per-service RSS
# Off-peak and owner-approved only: one 3.5-min master; read processing_applied.worker.{wall_s,peak_rss_mb}
```

Measurement harness (scratchpad, not committed): it generates `make_mix` WAVs, then starts N `run_adaptive_mastering_cli.py` processes in parallel and reports `getrusage(RUSAGE_CHILDREN)` for each. Total runtime in this session: about 7 minutes.
