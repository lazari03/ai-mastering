# Regression report

Everything below was executed in this audit; nothing is estimated. Commands
run from the repository root unless noted. Environment: Linux x86-64, Node
22.22.0, Python 3.12 (CI-equivalent venv built only from
`backend/requirements-test.txt`) and 3.11 (dev venv), ffmpeg on PATH.

## 1. Test suites

| Suite | Command | Result |
|---|---|---|
| Python DSP + service | `cd backend && python -m pytest -q` (3.12, requirements-test.txt) | **199 passed**, 0 failed (8 min 20 s) |
| Node API tests | `cd backend-node && npm test` | **46 passed**, 0 failed |
| Node lint (no-undef) | `cd backend-node && npm run lint` | clean |
| Node syntax | `find src -name '*.js' … node --check` | clean |
| Frontend production build | `cd frontend && npm run build` (NEXT_PUBLIC_SITE_URL set) | compiled; 49/49 pages generated |
| Synthetic regression | `cd backend && python -m benchmark.regression --synthetic --baseline benchmark/baselines/synthetic.json` | **0 drift** (exit 0) |

Baseline before this audit: 185 Python and 36 Node tests, none of them run
by CI.

### New tests and what each one pins

| File | Tests | Pins | Fails on the old code? |
|---|---|---|---|
| `backend-node/.../renderReservation.test.js` | 7 | stem + master reserved atomically; 5 concurrent stem renders with 1 credit → exactly 1; losers' master slots refunded; refunds per path; double release can't mint credit; fail-closed | n/a (module is new; the old route had no reservation for stems — see AURALITH_AUDIT A2) |
| `backend-node/.../pythonUpstream.test.js` | 3 | waits past a short timeout; multipart intact; 504 `processing_timeout` at the deadline; upstream status/detail passed through | n/a (new transport) |
| `backend/tests/test_input_limits.py` | 8 | over-limit WAV/MP3 refused (413) before any decode; reference named; 0 disables; dead channel mastered as mono with a warning; normal stereo untouched; all-silent still refused | yes — dead-channel test raised `InvalidAudioError` on `d9c591a` |
| `backend/tests/test_engines.py` | 6 | same decisions on both engines; Professional's sub/punch split only when compressing; renders differ only then; ≤ −120 dB difference otherwise; registry fallback | yes — exposed the stale Standard limiter description (A11) |

`backend-node` lint catches A3 on the old file: `991:48 'jobId' is not
defined (no-undef)`.

### End-to-end checks (not unit tests)

- **Node → Python transport:** `postMultipartToPython("/master", …)` from
  `masteringService.js` against the real FastAPI `/master` route (mastering
  router served without the chords router, which needs madmom): delivered
  master in 10 s, −18.0 → −12.9 LUFS, Professional engine, QC passed. Run
  with both the buffered and the final streamed body.
- **Undici timeout:** `fetch` to a server that never answers →
  `fetch failed after 301 s: UND_ERR_HEADERS_TIMEOUT` (Node 22.22.0).
- **Signed-in home gate** (headless Chromium, production build): stale hint
  revealed in 0.40 s and cleared; `/#faq` never gated; no hydration errors.
- **Pricing localization** (headless Chromium): Albanian shows
  "masterë / muaj", English shows "masters / month", `/pricing` SSR correct,
  no `[object Object]`.

## 2. Engine edge cases (full `master_track`, measured)

| Input | Time | Result |
|---|---|---|
| 20 s stereo 44.1 kHz | 10.1 s | delivered, −13.14 LUFS, −2.00 dBTP |
| 20 s mono file | 8.7 s | delivered (stereo out), −2.00 dBTP |
| 48 kHz / 96 kHz | 9.3 / 11.9 s | delivered at source rate, −2.00 dBTP |
| 22.05 kHz | 5.1 s | upsampled to 44.1 kHz by design, delivered |
| 2 s / 0.5 s | 1.1 / 0.5 s | delivered |
| digital silence / −80 LUFS | — | refused (`InvalidAudioError`) |
| −40 dB quiet mix | 14.8 s | delivered after 1 corrective render |
| clipped source (+14 dB into ±1) | 8.5 s | delivered −7.31 LUFS |
| already mastered (−8 LUFS, limited) | 8.7 s | delivered −9.15 LUFS (not pushed louder) |
| DC offset 0.2 | 9.6 s | delivered (offset removed) |
| one silent channel | — | **refused before** → **delivered after** (A9) |
| L = −R (phase-inverted) | — | refused (phase correlation) — correct |
| 8-minute track | **284 s** | delivered; RSS 724 MB → 2,999 MB |
| determinism (same input twice) | — | **bit-identical** files |

Not executed here: real stem separation (Demucs is not in the test
environment), WAV/MP3 export through the HTTP route beyond the existing
`test_delivery_check.py`, files over 8 minutes.

## 3. Synthetic regression: before vs after this audit

Same 19-track corpus (before the two `dense_drums_edm` tracks were added),
same dev venv, `d9c591a` (git worktree) vs the working tree:

```
## Drift vs baseline: 1
- one_dead_channel_rnb · error: InvalidAudioError: No mastering candidate
  passed final verification (... quality_control:channel_balance) -> None
```

The other 18 tracks are line-for-line identical. The fixes changed exactly
what they targeted.

## 4. Committed baseline (`backend/benchmark/baselines/synthetic.json`)

21 tracks, generated on Python 3.12 with the pinned dependencies; a second
full run against it: exit 0, no drift. Per track it records integrated
LUFS, true peak, PLR, short-term crest change, LRA change, transient
retention, low-end and HF change (actual, collateral, unplanned), tilt
drift, stereo correlation, limiter GR (p99.5 and max), added distortion,
delivered candidate, renders, initial failures and final warnings
(`regression.py` `measure()`). No track errors.

Threshold headroom over the corpus (from the baseline's calibration table,
min / p50 / max headroom, failures):

| Metric | Limit | min | p50 | max | over limit |
|---|---|---|---|---|---|
| tilt drift | 0.3 dB/oct | 0.245 | 0.245 | 0.254 | 0/21 |
| low-end collateral | 1.0 dB | 0.226 | 0.325 | 0.644 | 0/21 |
| HF collateral | 1.0 dB | 0.991 | 0.991 | 1.002 | 0/21 |
| PLR | QC fail < 4 dB | 1.33 | 1.80 | 6.87 | 0/21 |
| limiter max GR | QC fail > 6 dB | 0.30 | 0.30 | 2.03 | 0/21 |
| added distortion | −18 dB | 5.51 | 5.93 | 11.58 | 0/21 |

(From the 19-track run; the 21-track baseline adds one Standard/Professional
pair and no failures.) The tightest margins are limiter max GR (0.30 dB of
headroom, `pop_48k` at 5.7 dB vs the 6 dB QC line), PLR (1.33 dB) and tilt
drift — the first places a regression would show. Sample rate was ruled
out as a factor: the same mix at 44.1/48/96 kHz gives identical punch loss.

### Standard vs Professional (same audio)

| Pair | Differences |
|---|---|
| `rock_transient` / `_pro` | none on any tracked metric |
| `bass_heavy_hiphop` / `_pro` | none on any tracked metric |
| `dense_drums_edm` / `_pro` (compression on) | all ≤ 0.1 dB; limiter GR p99.5 2.13 → 2.02 dB; transient retention 0.894 → **0.881** (Professional slightly worse) |

## 5. Real-world corpus benchmark

**Not run: no licensed corpus exists in this environment.** The workflow
to run it exists and refuses to pass without it:

- `.github/workflows/release-benchmark.yml` (manual, self-hosted runner
  labelled `auralith-benchmark`): fails if the corpus directory is missing,
  holds fewer than 50 mixes, or no approved baseline exists; otherwise runs
  `benchmark.regression --corpus … --baseline …` and uploads the report.
- Corpus layout and licensing: `backend/benchmark/__init__.py`. Target
  coverage for 50–100 mixes: rock/live drums, pop (vocal-forward), electronic
  (house, techno, DnB), hip-hop/trap, acoustic/singer-songwriter, jazz,
  classical/cinematic, metal, plus already-loud masters and very dynamic
  material; at least 5 per genre (`MIN_TRACKS_PER_GENRE`) to count as
  calibration evidence.
- First run: `python -m benchmark.regression --corpus <dir> --write <dir>/real.json`,
  review `report.md`, then use it as the approved baseline.
