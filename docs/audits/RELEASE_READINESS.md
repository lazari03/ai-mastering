# Release readiness

Assessment of `main` at `d9c591a` plus the working-tree fixes from this
audit (not committed). Detail and evidence are in the other four reports.

## The eight questions

### 1. Which regressions were found?

- **Stem billing never got the concurrency fix the master slot got** — a
  regression in intent: the reserve-before-render change protected masters
  only, leaving stems consumable after the render with the result ignored
  (A2).
- **`/master` returned an error instead of a finished master whenever stem
  separation failed** — a `ReferenceError` on an undefined `jobId`,
  introduced with the "don't charge for stems that didn't run" change, so
  that change never worked (A3).
- **Stale engine self-description** after `main` changed the shared
  limiter (A11).
- None of these were caught because **CI ran no tests** (A1).
- No audio regression was found in the synthetic corpus: before vs after
  this audit, 18 of 19 tracks identical; the 19th is the intended fix (A9).

### 2. Which defects were fixed?

A1 CI gating · A2 stem reservation · A3 `jobId` · A4 300 s upstream
timeout · A5 duration cap · A7 pricing localization · A8 "Professional
mode" copy · A9 one-silent-channel files · A10 regression baseline + CI ·
A11 engine description. Each has tests that run in the new CI (see
REGRESSION_REPORT §1).

### 3. Which DSP improvements were objectively validated?

One audible-behaviour change: a mono recording exported to one channel is
now delivered on both sides instead of refused — measured before (no
master) and after (−12.7 LUFS, −2.0 dBTP, both channels carrying signal),
with every other corpus track unchanged. The duration cap is operational,
not sonic. **No claim of improved sound quality is made**: nothing in this
audit was listened to, and synthetic fixtures don't measure musicality.

### 4. Which problems remain unresolved?

| Item | Why open |
|---|---|
| Professional engine has no measured advantage (A6) | product decision, see below |
| No listening test; no real-music corpus | needs licensed mixes and listeners |
| Concurrency cap counts jobs, not memory (A12) | needs the VPS's RAM to size it |
| Server pages and backend errors English-only (A13) | needs an SEO/routing decision |
| Limiter max GR reaches 5.7 dB vs the 6 dB QC line on one synthetic track | not a failure; the margin to watch |
| Stem separation untested here | Demucs not in the test environment |
| Minor (A14–A16) | low impact |

### 5. Are Standard and Professional meaningfully differentiated?

**No.** They make identical decisions with an identical limiter; the only
difference is a sub/punch compression split used only when the plan
compresses (2 of 21 synthetic tracks). On same-audio pairs the masters are
identical, or within 0.1 dB with Professional's transient retention slightly
lower (0.881 vs 0.894). Standard was not degraded and no differentiator was
invented. The copy now describes the mechanism without claiming a benefit.

What would create a *real* difference (each needs its own measurement
before it ships):
1. **Album mode** — master several tracks against one shared loudness and
   tonal target so a release sits together; a concrete, Studio-level need
   the engine's per-track analysis already almost supports.
2. **Reference-track workflows** — saved references, a per-band "how close
   am I" report, stronger matching limits for the user's explicit request.
3. **Expose the manual chain's depth** in Pro Master mode as a paid layer,
   rather than a different automatic engine most users can't hear.

Until one of these exists, consider not listing "Professional engine" as a
headline plan feature.

### 6. Is the product technically safe to deploy?

**Yes, with the fixes in this working tree, once CI is green on GitHub.**
The P0 (deploying untested code) and the P1 billing, timeout and memory
issues are fixed and tested. The new CI jobs have only been run locally
(identical commands, Python 3.12, pinned dependencies) — they have never run
on GitHub's runners, so the first push should be watched. Size
`MASTERING_MAX_DURATION_MINUTES` / `MASTERING_MAX_CONCURRENT_JOBS` against
the VPS's RAM (~4.5 GB per 15-minute job by the measured rate).

### 7. Is mastering quality validated sufficiently to justify €19.99/month?

**Not yet.** What is validated: the engine is safe — it doesn't damage
healthy mixes (0 EQ moves on healthy fixtures), corrects measured problems,
hits its true-peak ceiling exactly, refuses what it can't master, is
deterministic, and its billing is now correct. What is not validated: that
it sounds better than the original mix, or as good as alternatives, on real
music. That requires the blinded listening test below and the real corpus.
€19.99 (All-Access) mostly buys volume (250 masters) and stems; its value
rests on stem separation, which this audit could not test.

### 8. The three highest-value improvements remaining

1. **A blinded listening test on real mixes** before any further DSP work.
   Everything needed exists: `python -m benchmark.calibration_ab mix.wav
   --genre <genre> --engines --excerpt 60,40` gives loudness-matched,
   letter-coded versions (raw, three calibrations, other engine) and a
   ballot; `benchmark/run_benchmark.py` adds legally obtained competitor or
   human masters to the same blind set. 10–15 mixes, 3+ listeners. This
   settles the calibration default and whether the product is worth paying
   for.
2. **Build the licensed real-mix corpus (50–100 tracks) and approve its
   baseline**, then run `release-benchmark.yml` before every engine
   release. It turns "did this change hurt real music?" from opinion into a
   gate.
3. **Give Professional / Studio a real reason to exist** (album mode first),
   or reposition the tiers around volume and stems honestly. Today a
   Studio customer pays for an engine difference they will almost never
   hear.

## Deployment checklist

- [ ] Review and approve this working tree (diff summary in the session).
- [ ] Commit; push; confirm all five CI jobs pass on GitHub (first run of
      `python-tests` and `synthetic-regression` there).
- [ ] Set `MASTERING_MAX_DURATION_MINUTES` / `MASTERING_MAX_CONCURRENT_JOBS`
      for the VPS's RAM (defaults: 15 and 3).
- [ ] After deploy: one stem-separation master on All-Access; one
      deliberately failing upload — confirm the credit is returned.
- [ ] Optional: `PYTHON_UPSTREAM_TIMEOUT_MS` if the browser timeout changes
      (keep it below the browser's 20 min).
