# Auralith Forge — Audit findings

Audit of `main` at `d9c591a` (2026-10-10). Every finding below was confirmed
by running code, a tool, or a measurement unless marked **suspected**.
Fixes are in the working tree (not committed); see `REGRESSION_REPORT.md`
for the tests that prove each one.

Severity: **P0** broken / billing / security · **P1** audible or reliability
degradation, misleading claims, missing tests · **P2** architecture / UX /
maintainability · **P3** minor.

## Summary

| ID | Sev | Finding | Status |
|---|---|---|---|
| A1 | P0 | CI deploys to production without running a single test | **Fixed** |
| A2 | P1 | Stem separation charged after the render: concurrency bypass and silent unbilled jobs | **Fixed** |
| A3 | P1 | Undefined `jobId` in `/master`: user gets an error instead of a finished master when stem separation fails | **Fixed** |
| A4 | P1 | Gateway gives up on the Python service at 300 s; the browser waits 20 min | **Fixed** |
| A5 | P1 | No maximum input duration: one upload can exhaust server memory | **Fixed** |
| A6 | P1 | Professional engine has no measured quality advantage over Standard | **Open — product decision** |
| A7 | P2 | Pricing grid, Plans panel and plan comparison English-only for Albanian users | **Fixed** |
| A8 | P2 | "Professional mode" copy conflates the free manual mode with the paid engine | **Fixed** |
| A9 | P2 | A file with one silent channel is refused; no master delivered | **Fixed** |
| A10 | P2 | Regression harness had no baseline and no CI use | **Fixed** |
| A11 | P2 | Engine self-description stale (Standard limiter "3 ms") | **Fixed** |
| A12 | P2 | Concurrency cap counts jobs, not memory | Open |
| A13 | P2 | Server-rendered marketing/legal pages and backend error messages are English-only | Open |
| A14 | P3 | Input-validation notes (e.g. DC offset removed) never reach the user | Open |
| A15 | P3 | A −80 LUFS file is refused as "digital silence" | Open |
| A16 | P3 | Stale comments and dead legacy chord-product handlers | Open |

---

## A1 · P0 · CI runs no tests — Fixed

- **File:** `.github/workflows/deploy.yml`
- **Evidence:** the three gating jobs ran `npm run build` (frontend),
  `node --check` per file (Node API) and `python -m compileall` (Python).
  None ran `npm test` or `pytest`. `deploy` needed only those three, so a
  broken mastering engine or billing regression deployed as long as it
  compiled. 36 Node tests and 185 Python tests existed and gated nothing.
- **Fix:** new jobs `python-tests` (full pytest) and `synthetic-regression`
  (engine output vs committed baseline); `node-check` now runs
  `npm run lint` (no-undef) and `npm test`. `deploy.needs` lists all five.
  Python tests install a pinned `backend/requirements-test.txt` (no
  torch/essentia: no test imports them) on Python 3.12, matching
  `backend/Dockerfile`. A separate, manual `release-benchmark.yml` runs the
  real-corpus gate and fails loudly when the corpus or baseline is missing.

## A2 · P1 · Stem billing bypass — Fixed

- **File:** `backend-node/src/routes/masteringRoutes.js` (`/master`);
  `entitlementsService.js` (`refundStemQuota`, `refundExtraStemCredit`
  defined, never called anywhere).
- **Evidence:** the master slot was moved to reserve-before-render after an
  earlier concurrency incident; the stem slot was not. Stems were a snapshot
  read before the render and `consumeStemQuota()` / `consumeExtraStemCredit()`
  after it, with the boolean result ignored. Five concurrent stem renders
  with one stem credit all passed the read and all ran Demucs (the most
  expensive job in the app); the losing consumes returned `false` silently.
  Any Firestore error in that post-render consume also produced an
  unbilled stem job.
- **Fix:** `services/renderReservation.js` reserves master AND stem
  atomically before the render (all-or-nothing: a failed stem reservation
  gives the master slot back), releases exactly what was reserved when the
  render fails, and releases only the stem part when separation didn't run.
  Refund failures are reported, never thrown over the real error.
- **Tests:** `renderReservation.test.js` (7): 5 concurrent stem renders / 1
  credit → exactly 1 renders, every loser's master slot refunded; master
  gate unchanged; refunds per path; double release never mints credit;
  fail-closed on a throwing consume.

## A3 · P1 · `jobId` ReferenceError in `/master` — Fixed

- **File:** `masteringRoutes.js`, stem-not-run branch of `/master`.
- **Evidence:** `console.warn(\`...job ${jobId}...\`)` — `jobId` is not
  defined in that handler's scope (ES module, no global). Confirmed by
  ESLint `no-undef` on the committed file: `991:48 'jobId' is not defined`.
  Whenever a user requested stems and Demucs failed — a case the engine
  handles by delivering a plain master — the route threw after the
  successful render: the user got an error, the master slot was refunded,
  and the "stem separation didn't run, you weren't charged" warning has
  never been shown.
- **Fix:** uses `result.job_id`. Prevented in future by `npm run lint`
  (`backend-node/eslint.config.js`, `no-undef` only) in CI. The same scan
  over `frontend/src` found no `no-undef` errors.

## A4 · P1 · 300-second upstream timeout — Fixed

- **File:** `backend-node/src/services/masteringService.js`
  (`postMultipartToPython`), global `fetch`.
- **Evidence:** Node 22's fetch (undici) aborts when response headers take
  over 300 s: measured `fetch failed after 301 s: UND_ERR_HEADERS_TIMEOUT`.
  The Python service sends headers only when the render is finished. An
  8-minute track measured **284 s** on the dev container; the production
  VPS and stem jobs are slower. The browser waits 20 min
  (`frontend/src/network/http/client.js` `MASTERING_TIMEOUT_MS`). Result:
  long tracks failed at 5 min with a refund, while Python finished a master
  nobody could download (compute and a concurrency slot wasted).
- **Fix:** `services/pythonUpstream.js` posts with `node:http` and one
  19-minute deadline (`PYTHON_UPSTREAM_TIMEOUT_MS`), just inside the
  browser's 20; multipart encoded by the platform (`new Response(form)`),
  streamed. A dedicated 504 `processing_timeout` error.
- **Tests:** `pythonUpstream.test.js` (3) plus an end-to-end run of
  `postMultipartToPython` against the real FastAPI `/master` route.

## A5 · P1 · No duration cap — Fixed

- **Files:** `backend/app/services/mastering_service.py`
  (`_decode_input_if_required`), `backend/app/core/config.py`.
- **Evidence:** only file size was capped (200 MB). 200 MB of MP3 is ~3 h
  of audio. Measured: 8 min of audio → 284 s and +2.3 GB RSS for one job
  (~35 s and ~285 MB per minute). Three concurrent long uploads could
  exhaust the VPS and OOM-kill every in-flight job.
- **Fix:** duration probed from the container header (soundfile, then
  ffprobe) BEFORE decoding, on every path (master, its reference, analyze,
  chords). Over `MASTERING_MAX_DURATION_MINUTES` (default 15 → ~9 min and
  ~4.5 GB per job by the measured rates) → 413 with a clear message; the
  upload is deleted. 0 disables.
- **Tests:** `test_input_limits.py`: WAV and MP3 refused, MP3 refused
  before ffmpeg is invoked, reference named, under-limit passes, 0 disables.

## A6 · P1 · Professional engine not meaningfully better — Open (product decision)

- **File:** `backend/ai_mastering/engines.py`.
- **Evidence:** the engines share every decision and the limiter; the only
  rendering difference is the sub/punch compression split, used only when
  the plan compresses. Synthetic baseline: on 2 of 3 same-audio pairs the
  masters are identical on every tracked metric; on the compressing pair
  every difference is ≤ 0.1 dB and Professional retains slightly LESS
  transient energy (0.881 vs 0.894). Without compression the two renders
  differ by −149 dB (float rounding).
- **Not done, deliberately:** no differentiator was invented and Standard
  was not degraded. Marketing now describes only the mechanism. See
  `RELEASE_READINESS.md` for options.

## A7 · P2 · Pricing not localized — Fixed

- **Files:** `frontend/src/lib/pricing.js`, `lib/product.js`,
  `app/HomeClient.jsx`, `app/ui/PlansPanel.jsx`, `app/pricing/page.js`,
  `app/ai-mastering-online/page.js`.
- **Evidence:** plan blurbs, feature lists, the comparison table and the
  single-master/stem blurbs rendered English for Albanian users on the two
  surfaces where purchase decisions are made.
- **Fix:** values are `{en, sq}`, rendered through `localized()` (passes
  booleans through, so table ticks still work). Verified in Chromium on a
  production build: English and Albanian correct, no `[object Object]`.

## A8 · P2 · "Professional mode" naming — Fixed

- **File:** `frontend/src/content/genrePages.js` (4 lines).
- **Evidence:** pages said "Professional mode gives full manual control".
  Manual mode is the console's "Pro Master" mode and is available on every
  plan (not gated in UI or API); "Professional" is the paid engine.
- **Fix:** "Pro Master mode (manual controls, on every plan)".

## A9 · P2 · One silent channel → no master — Fixed

- **Files:** `backend/ai_mastering/quality_control.py`
  (`validate_input_signal`), `mastering.py` (warning).
- **Evidence:** a stereo file with one channel at digital silence (a mono
  recording exported to one side) failed every candidate (channel balance,
  low-end, tilt) and delivered nothing.
- **Fix:** using the module's existing silence definition (`SILENCE_RMS_DB`,
  no new threshold), the live channel is played on both sides, with a
  user-facing warning. Both-silent is still refused; normal stereo is
  untouched (asserted bit-exact).

## A10 · P2 · Regression harness unused — Fixed

- **Files:** `backend/benchmark/regression.py`, new `synthetic_corpus.py`,
  `benchmark/baselines/synthetic.json`.
- **Evidence:** `regression.py` is good infrastructure but needs a real
  licensed corpus; no baseline had ever been committed; CI never ran it.
- **Fix:** `--synthetic` builds a deterministic 21-track corpus from the
  calibrated fixtures (11 genres; mono, 48 kHz, 3 s, clipped,
  already-limited, quiet/dynamic, wide low end, +12 dB boom, dead channel,
  Standard/Professional pairs on identical audio). Baseline generated on
  Python 3.12 with the pinned test dependencies; a second run reports zero
  drift.

## A11 · P2 · Stale engine description — Fixed

`engines.py` described the shared limiter as "true-peak lookahead limiter
(3 ms)"; `main` had changed it to a ramped attack with a 1 ms lookahead.
Caught by the new `tests/test_engines.py`.

## A12 · P2 · Count-based concurrency — Open

`app/api/routes/mastering.py` `_master_slots` allows 3 concurrent jobs
regardless of length. With A5 a job is bounded (~4.5 GB at 15 min), but
three maximal jobs (~13.5 GB) can still exceed a small VPS. Recommendation:
weight the semaphore by duration, or size `MASTERING_MAX_CONCURRENT_JOBS` /
`MASTERING_MAX_DURATION_MINUTES` to the VPS's RAM. VPS size was not
available to this audit.

## A13 · P2 · English-only surfaces — Open

Server-rendered pages (`/pricing`, genre pages, legal, tool landing pages)
and every Node error message (`masteringRoutes.js` 402/400 details) are
English. The in-app console and homepage are bilingual. Needs a decision on
whether server pages get per-language routes (SEO impact).

## A14–A16 · P3

- **A14** `validate_input_signal` notes (DC offset removed, L/R imbalance)
  are returned but never surfaced as `source_warnings`.
- **A15** a −80 LUFS file is refused with "Audio is digital silence"; the
  refusal is reasonable, the wording isn't.
- **A16** stale comments (`lib/seo.js` "3 plans", `masteringService.js`
  "professional … true-peak limits"); `polarService.js` still maps the
  retired `chordsMonthly`/`chordDetection` products (harmless dead paths).

---

## Verified correct (no defect found)

- **Webhooks** (`webhookRoutes.js`, `polarService.js`): signature verified on
  the raw body before parsing; `order.paid` idempotent via a
  `processedPolarOrders` record in the same transaction as the credit;
  out-of-order subscription events skipped by Polar `modifiedAt`;
  `order.refunded` removes a credit at most once; unknown event types
  acknowledged (no infinite retries); processing failures return 500 so
  Polar retries.
- **Master quota:** reserved atomically before the render, refunded on
  failure; month-boundary refunds refused (no minted masters); Free is a
  lifetime counter.
- **Data isolation:** every download/original/codec-preview/delete route
  checks `ownsJob`; the Python service is not exposed publicly (only
  Caddy's 80/443).
- **Uploads:** multer size cap and audio filter; ffmpeg subprocess timeouts.
- **Delivery:** MP3 output is decoded and true-peak verified, re-trimmed if
  needed (`deliver_and_verify`).
- **Engine edge cases** (measured): stereo, mono, 48/96 kHz, 22.05 kHz
  (upsampled), 2 s and 0.5 s, clipped source, already-mastered, DC offset
  all deliver finite audio at the ceiling; silence refused; output is
  **bit-identical** across repeat runs.
- **Chord detection claims:** consistent everywhere ("free"); server has no
  quota, only the shared fair-use rate limit (20 expensive requests / 15
  min). No paid/limited claim found in current code.
- **Claims:** no guaranteed-quality or "better than" claims; the eMastered
  comparison says "better depends on your ears". Structured data is derived
  from `PLANS`, so prices can't drift.
