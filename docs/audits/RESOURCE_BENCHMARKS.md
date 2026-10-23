# Resource benchmarks and economics

All numbers below were measured in this session. The machine was a cloud container with 4 vCPU and 16 GB RAM, running Python 3.12 on CPU only.
Production hardware is **not** measured. Re-run the scripts there (commands at the end)
before trusting the absolute times.

## 1. Mastering worker (Standard, no stems)

Each job is rendered in a killable worker process (`app/core/job_runner.py`); the peak is that process's `ru_maxrss`. The input was a synthetic
pop mix (`tests/synthetic.make_mix`) at 44.1 kHz stereo, WAV output.

| Audio | Wall | Peak RSS |
|---|---|---|
| 0.2 min | 10.0 s | 392 MB |
| 1 min | 32.4 s | 582 MB |
| 4 min | 131.4 s | 1508 MB |
| 8 min | 274.6 s | 2706 MB |
| 12 s real request through `/master` (uvicorn) | 13 s | 394 MB |

* **Memory** fits ≈ 280 MB + 303 MB per audio-minute (linear from 1 to 8 min).
* **Time** ≈ 0.57 s of wall time per second of audio.
* Earlier in-process measurement (previous audit): 8 min took 284 s and +2.3 GB, which is consistent.

**Cost model defaults, now set from measurements** (`app/core/config.py`):

| Parameter | Value |
|---|---|
| `MASTERING_COST_BASE_MB` | 450 |
| `MASTERING_COST_PER_MINUTE_MB` | 310 |
| `MASTERING_COST_REFERENCE_MB` | 150 (not measured separately; unchanged) |

The estimate is `base + per_minute × minutes × (sr / 44100)`. At 8 min that gives 2930 MB against 2706 MB measured (+8 %); at 1 min, 760 MB against 582 MB.

`MASTERING_MASTER_SECONDS_PER_AUDIO_SECOND` = 0.6.

## 2. Demucs (stem separation), real music

Inputs:
* `frontend/public/audio/demos/pop-before.mp3`, the product's own 33.6 s demo asset;
* "Kuromaru – Alone (Post-Rock Background Music)", 218.9 s, from Wikimedia Commons, which hosts only freely
  licensed media (the licence is on the file page).

The command matches `ai_mastering/stem_separation.py`: `demucs.separate -n <model> --two-stems vocals -d cpu`, with Demucs 4.1.0 on torch 2.14.1+cpu.

| Track | Model | Wall | CPU | Peak RSS | Wall / audio |
|---|---|---|---|---|---|
| 33.6 s pop | htdemucs (incl. first model download) | 29.3 s | 78.9 s | 1239 MB | — |
| 33.6 s pop | htdemucs_ft (incl. first model download) | 116.8 s | 327 s | 1824 MB | — |
| 218.9 s post-rock | htdemucs_ft (cached) | **509.7 s** | 1742 s | **2838 MB** | **2.33×** |
| 218.9 s post-rock | htdemucs (cached) | 143.8 s | 474.7 s | 1728 MB | 0.66× |

* Demucs uses about 3.4 of the 4 cores (CPU ÷ wall).
* Memory ≈ 1.6 GB + ≈ 330 MB per audio-minute for htdemucs_ft.

**Full pipeline**: `master_track(..., enable_stem_separation=True)` on the 33.6 s demo, with cached models:
* 90.0 s wall;
* `stem_separation.status = applied`, engine `demucs_htdemucs_ft`;
* Demucs subprocess peak 1781 MB; mastering process peak 580 MB;
* result: "vocal … already sits correctly in the mix, so it was left unchanged" (see the finding below).

### Findings

1. **Long stem jobs could never finish.** htdemucs_ft runs at 2.33× realtime, so a 15-min track (the duration cap)
   needs about 35 min of separation, against an 18-min job timeout. The job ran to the timeout, held a
   stem slot and about 4 GB the whole time, then failed. **Fixed**: the job is refused up front with 413
   `stems_too_long` when `duration × (stem_rate + master_rate) > job_timeout`.
   * With the defaults that is 1080 s ÷ (2.4 + 0.6) = **6.0 min**. The figure is configurable through
     `MASTERING_STEM_SECONDS_PER_AUDIO_SECOND` and exposed on `GET /capacity`.
   * The reservation is refunded (Node refunds on any upstream error).
   * **Product impact**: stem separation is effectively limited to tracks of 6 min or less on 4 vCPU. Options:
     * more cores (the rate scales roughly with cores);
     * fall back to htdemucs (3.5× faster) for long tracks;
     * a longer, asynchronous job path.
     The fallback to htdemucs is a quality decision for the owner and was not made here.
2. `MASTERING_COST_STEM_MB` was raised from 3000 (a guess) to **3700**: Demucs at the 6-min cap is about 1.6 + 6 × 0.33 ≈ 3.6 GB,
   and it is a separate process alongside the worker.
3. The separation subprocess has its own `timeout=1800` and 2 attempts × 2 models. It cannot outlive the job any more,
   because the worker's process group, which includes Demucs, is killed at the job deadline.
4. **Billing question, not changed**: on the demo the user would be charged a
   stem credit (status `applied`), but the engine left the vocal unchanged. Separation ran, so this
   is arguably correct, but the user received no audible difference for €4.99. Decide whether
   `vocal_enhancement = unchanged` should refund the stem. That is a policy change to entitlements, so it is
   left for approval.

## 3. Capacity

On a 16 GB box, the auto budget is the cgroup limit × 0.75 or host RAM × 0.5, giving 8 GB on this host.

| Jobs | Estimate |
|---|---|
| 4-min Standard | 450 + 1240 = 1690 MB → 3 concurrent (the job cap) |
| 15-min Standard | 5100 MB → 1 at a time |
| 6-min stem | 2310 + 3700 = 6010 MB → 1 at a time (also `MAX_CONCURRENT_STEM_JOBS=1`) |

Everything else waits in a FIFO queue (6 places, 120 s), then gets a 503 `at_capacity` or `queue_timeout`, with
Retry-After and nothing charged.

## 4. Economics

There is no production cost data in the repository, so these are formulas plus one example with a **stated assumption**.

```
box_seconds_per_job ≈ wall_s × (cores_used / box_cores)
cost_per_job        = box_seconds_per_job / (30 × 86400) × box_monthly_price
```

Measured inputs: Standard 4-min master 131 s wall, with cores used unmeasured. It is mostly single-threaded
DSP; the conservative assumption is a full box. A 4-min htdemucs_ft stem job is 560 s separation (3.4 cores) plus 131 s mastering.

**All-Access worst case** (a user maxing the plan: 250 masters + 20 stem masters of 4 minutes):

| | Box-seconds (conservative, whole box) |
|---|---|
| 250 masters | 250 × 131 = 32,750 |
| 20 stem jobs | 20 × (560 + 131) = 13,820 |
| Total | 46,570 s ≈ 12.9 h of the box per month |

* Example price: *assumption, replace with the real invoice*: a 4 vCPU / 16 GB VPS at €20/month. The worst case then costs about €0.36 per All-Access user per month,
  against €19.99 revenue less payment fees.
* **Compute cost is not the constraint; latency and capacity are.**
  * Stem jobs are serialized (1 at a time), and a 4-min stem job holds the stem slot for about 11.5 min.
  * One box therefore delivers about 125 stem jobs per day at 100 % utilisation.
  * If 20 % of a 300-user All-Access base used all 20 stems in the same week, that is 1200 jobs, about 9.6 box-days.
* The 20 stems/month entitlement is affordable. Peak stem demand needs either a second worker box or async
  jobs; the current synchronous request path can hold only one stem job at a time.

## Reproduce

```
# Worker (from a scratch dir; the script must guard __main__ because of forkserver)
python worker_bench.py <outdir> 1,4,8      # see docs: calls stage_mastering_request + run_in_worker
# Demucs
python -m demucs.separate -n htdemucs_ft --two-stems vocals -d cpu -o out track.wav   # wrap in getrusage(RUSAGE_CHILDREN)
# Live capacity on a running service
curl localhost:8001/capacity
```

The measurement scripts lived in the session scratchpad. They are short
(stage → `run_in_worker` → print stats) and not committed, so they don't run in CI.
