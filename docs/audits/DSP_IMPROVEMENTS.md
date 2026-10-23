# DSP changes and measurements

This audit changed the engine's audio behaviour in **one** place. Every
other DSP stage was investigated and left alone, either because the
measurements showed no defect or because a change would have needed
evidence (listening, a real corpus) that this audit could not produce. No
DSP threshold was loosened.

## Changed

### 1. A file with one silent channel is mastered as mono (was: refused)

- **Where:** `ai_mastering/quality_control.py` `validate_input_signal`;
  user warning in `mastering.py`.
- **Rule:** stereo input where exactly one channel is below the module's
  existing `SILENCE_RMS_DB` (−70 dB, the same definition that refuses a
  silent file) and the other carries signal → the live channel feeds both
  sides. No new threshold.
- **Before** (`d9c591a`): `InvalidAudioError: No mastering candidate passed
  final verification (evaluation:band_collateral, evaluation:low_end_loss,
  guardrail:low_end_loss, guardrail:tilt_drift,
  quality_control:channel_balance)`. Nothing delivered.
- **After:** delivered on the first render, −12.7 LUFS (requested −12.3),
  −2.0 dBTP, tilt +0.05 dB/oct; both output channels carry the music
  (asserted: quieter side ≥ 50 % of the louder side's RMS), plus a warning.
- **Unchanged:** all 18 other synthetic tracks line-for-line identical;
  normal stereo is returned bit-exact; both-silent still refused.
- **Test:** `tests/test_input_limits.py`.

### 2. Inputs over 15 minutes refused before decoding (operational)

Not a sound-quality change, listed because it changes what the engine
accepts. Measured cost: 8 min of audio → 284 s render and +2.3 GB RSS
(~35 s and ~285 MB per minute). Default 15 min (~9 min, ~4.5 GB per job),
`MASTERING_MAX_DURATION_MINUTES`. See AURALITH_AUDIT A5.

## Investigated, not changed (with the evidence)

### Tonal preservation (Phase 2.1)

- **Healthy mixes are left alone.** Gate audit (`benchmark/gate_audit.py`,
  balanced calibration): 0 EQ moves on healthy fixtures with ±1, ±1.5 and
  ±2 dB of random spectral ripple (6 seeds each).
- **No unnecessary HF boost.** HF boosts need the strictest gate
  (`boost_high` 0.50 vs cut 0.30), are blocked on bright/harsh sources and
  whenever the plan diagnoses HF excess, and are capped by a cumulative HF
  budget. Measured HF collateral headroom over the synthetic corpus: ≥ 0.991
  dB inside its 1.0 dB tolerance on every track.
- **Bass impact.** Low-end protection (40–120 Hz) caps collateral cuts;
  low-end collateral headroom ≥ 0.226 dB on every track. The extreme-boom
  case (+12 dB, `boomy_extreme_trap`) is delivered corrected, not as the
  EQ-free fallback — the fix from `d9c591a`, now pinned by the baseline.
- **Cumulative drift across stages.** Guarded by the unplanned tilt check
  (0.3 dB/oct); corpus headroom 0.245 dB/oct minimum. This is the
  second-tightest margin in the corpus and the most likely place a future
  regression would appear first.
- **Genre targets.** Genre shifts the target by at most ±2 dB relative to
  the cross-genre mean (`GENRE_CURVE_MAX_OFFSET_DB`); it never prescribes a
  move on its own. No change.
- **Before/after comparisons.** Every comparison in the product and the
  benchmarks is loudness-matched (`band_levels.loudness_matched_band_deltas`,
  `benchmark/run_benchmark.listening_set` gain-only matching), and the
  absolute guardrail caps now measure against the midrange so a level shift
  isn't read as a tonal change (`d9c591a`).

### Dynamics and transients (Phase 2.2)

- Loudness is a range and subordinate to damage: gain is capped by the
  limiter damage budget; a quieter master is accepted rather than crushing
  transients (`_plan_loudness`). Corpus evidence: `quiet_dynamic_jazz`
  delivered at −16.0 LUFS (not pushed further); `already_limited_edm` −9.0 →
  −8.0 LUFS only; `healthy_master_pop` −10.5 → −10.0.
- Compression is enabled only when measured need exceeds 0.2; on 19 of the
  21 synthetic tracks it stays off (verified by planning every corpus
  track; only the two `dense_drums_edm` tracks compress).
- Limiter GR on the corpus: p99.5 up to 4.13 dB (`one_dead_channel_rnb`),
  instantaneous max up to **5.7 dB** (`pop_48k`) against the QC failure
  line of 6 dB — the tightest dynamics margin in the corpus (0.3 dB). Not a
  defect (the verdict passes it), but the first metric to watch.
- **Sample rate does not change the result.** Same mix at 44.1 / 48 / 96
  kHz: punch loss 0.100 / 0.100 / 0.100 and 0.111 / 0.111 / 0.110, PLR
  equal to 0.01 dB (two seeds). An earlier edge run's punch flags at 48/96
  kHz came from different mix content, not the rate.

### Limiter (Phase 2.3)

Not replaced. Measured: delivered true peak exactly at the ceiling on every
edge case (−2.00 dBTP for loud masters, −1.0 for quiet ones); true-peak
measurement at 16× in the final compliance check; MP3 output decoded and
re-verified (`deliver_and_verify`); clipped input delivered without
overshoot; stereo-linked gain (one curve for both channels). The ramped
attack on `main` was already validated before this audit (splatter and
punch measurements in `bus_processing.py`). A Professional-only limiter
variant was built and measured earlier in this session and **dropped**:
within noise on real tracks.

### Reference mastering (Phase 2.4)

Not changed. Existing behaviour, verified by `tests/test_reference_matching.py`
(all pass): the target moves 60 % toward the reference
(`REFERENCE_CURVE_WEIGHT`) and a move closes 80 % of that gap — about half
way overall; reference EQ capped at +3/+2/+2.5 dB boost and −4 dB cut;
reference loudness and dynamics never used; all budgets, evaluation and QC
still apply; a matching reference changes nothing (< 0.3 dB).

### Standard vs Professional (Phase 3)

See AURALITH_AUDIT A6: no measured quality advantage. Same-audio pairs are
identical on 2 of 3 synthetic pairs and within 0.1 dB on the third (where
Professional's transient retention is slightly lower, 0.881 vs 0.894).
`tests/test_engines.py` now pins the contract the copy describes.

## Not measurable in this audit

- **How any of this sounds.** No listening test was performed; synthetic
  fixtures say nothing about musicality. `benchmark/calibration_ab.py`
  produces the blinded, loudness-matched comparison set for that (see
  RELEASE_READINESS).
- **Real-music behaviour at scale:** no licensed corpus available.
- **Stem separation quality:** Demucs not installed in the test environment.
