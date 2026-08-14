# Mastering Engine Architecture

What this app's mastering engine actually is, how audio flows through it, and
— honestly — where it stands against a genuinely "professional" bar. Written
from the real code, not the aspiration.

## 1. The two-backend split

There are two backends in this repo. Only one is live.

- **`backend-node/`** (Express, port 8000) — what the frontend actually talks
  to. Handles uploads, presets, routing. Has **no DSP of its own** for
  mastering — it shells out to Python via CLI scripts (`run_adaptive_
  mastering_cli.py`, `render_preset_master_cli.py`, `chord_detect_cli.py`,
  `clean_audio_cli.py`) and reads back JSON from stdout.
- **`backend/`** (FastAPI, Python) — where all the actual signal processing
  lives, in the `ai_mastering/` package and `app/services/`. The FastAPI
  server itself (`app/main.py`) is not the live path — the CLI scripts import
  the same Python modules directly. Both entry points hit identical code.

Everything below is about `backend/`, since that's where mastering happens
regardless of which entry point triggered it.

## 2. Two mastering engines, two different problems

There are genuinely two separate rendering paths, not one engine with modes:

| | **Adaptive engine** (`ai_mastering/mastering.py`) | **Preset engine** (`app/services/preset_dsp_engine.py`) |
|---|---|---|
| Driven by | genre + style + tags + 7 tweak sliders | a full JSON processing spec (hand-written or LLM-generated) |
| Decides parameters | yes — measures the track, computes deltas from a target profile | no — executes exactly what the JSON says |
| Used when | no preset, or a "lightweight" preset (genre/tags only) | a preset with a `processing` block (built-in or imported) |

They don't share a processing pipeline. The adaptive engine is analysis-driven
adaptive DSP; the preset engine is a literal interpreter for a mastering-chain
spec. This document is mostly about the adaptive engine since that's the
default path every user hits; the preset engine is covered in §7.

## 3. Adaptive engine signal flow

```
input file
   │
   ▼
_load_audio()                    → stereo float32 @ 44.1kHz, resampled if needed
   │
   ▼
_analysis_from_audio()           → LUFS, true peak, dynamic range, 7-band spectral
   │                                balance, stereo width/correlation, mono risk,
   │                                tempo, clipping flag        [§5]
   ▼
compute_processing_params()      → target LUFS, per-band EQ deltas, per-band
   │                                compression ratio/threshold, stereo width
   │                                target, saturation amount    [§4]
   ▼
_apply_user_tweaks()             → the 7 -1..1 sliders nudge the computed params
   │
   ▼
_detect_song_sections()          → chorus/bridge/final-chorus region detection
   │                                (used for automation later, not for EQ/comp)
   ▼
[optional] stem separation        → demucs vocal/accompaniment split, vocal-only
   │                                 compression + chorus/bridge reverb send
   ▼
Mid/Side split                    → mid = (L+R)/2, side = (L-R)/2
   │
   ▼
Per-band split (mid AND side, separately)
   │        standard tier: low(20-250) / low_mid / high_mid / high     — 4 bands
   │        pro tier:      sub(20-90) / punch(90-250) / low_mid / high_mid / high — 5 bands
   ▼
Per-band Compressor + shelf/peak EQ (pedalboard), mid and side independently
   │
   ▼
Sum bands back → mid_processed, side_processed
   │
   ▼
Saturation (pedalboard.Distortion, mid + attenuated side)
   │
   ▼
Stereo width: low/high split of side channel, width applied to high side only,
   │           + section-automated width boost during chorus/bridge
   ▼
Rebuild L/R from mid + width-adjusted side
   │
   ▼
Air shelf automation (subtle 12kHz lift during chorus/bridge sections)
   │
   ▼
Mono-compatibility recheck → if processing introduced new mono risk, retroactively
   │                          reduce width and rebuild
   ▼
Bus processing [§6]               → glue compression, LUFS gain-staging, limiting
   │           standard tier: _bus_process()      (pedalboard.Limiter)
   │           pro tier:      _bus_process_pro()   (custom lookahead true-peak limiter)
   ▼
Dynamics-recovery check           → if loudness range collapsed too far below the
   │                                 source's own range, blend some pre-bus signal
   │                                 back in and re-run bus processing
   ▼
sf.write() → output wav (PCM_24)
   │
   ▼
_analysis_from_audio() again → analysis_after, returned alongside analysis_before
```

## 4. Parameter computation (`mastering_params.py`)

The adaptive engine doesn't apply fixed settings — it computes a **delta**
from measured analysis to a genre's target profile, then applies partial
correction (not full correction) so it doesn't over-shape material that's
already close to target.

- **Target LUFS**: genre base (`params.py: GENRE_TARGET_PROFILES`, e.g. pop
  -9.0, hiphop -8.0, edm -7.0, podcast -16.0, classical -18.0) + style delta
  (`MASTERING_STYLE_PROFILES`, e.g. "modern" = -1.0 LUFS) + tag biases. Then
  clamped by how far the engine is willing to push a given track — max
  raise/reduce caps, tightened further if the input already has low loudness
  range (a track with LRA ≤ 2.0 barely gets touched at all, on purpose, to
  avoid crushing already-loud/already-limited masters further).
- **Per-band EQ**: for each of the 7 analysis bands (`SPECTRAL_BAND_KEYS`),
  compares current energy share to the genre's target spectral balance,
  converts the ratio to dB, applies **partial correction** (0.3-0.4x the raw
  delta), clamps to ±2-3.5dB. Several genre-specific guards on top (e.g. rock
  "low-end protection" caps EQ moves when a track is already bass-heavy, a
  guitar-forward guard caps upper-mid boosts when upper-mid energy is already
  high).
- **Per-band compression**: ratio and threshold derived from how far dynamic
  range exceeds the genre's target, scaled down ~55% ("keep compression
  musically light"), then further reduced under various guard conditions.
- **Stereo width / saturation / vocal presence**: similarly measured-then-
  nudged-toward-target, not fixed values.

This is real adaptive behavior — the same genre setting produces different
processing on a track that's already loud/wide/bright vs. one that isn't.

## 5. What the analysis actually measures (`_analysis_from_audio`)

Per render, before and after:

- `integrated_lufs` (pyloudnorm, full ITU-R BS.1770)
- `short_term_lufs` / `_max` / `_min` — mean/max/min of a 3s-window/1s-hop
  series (**not** the spec's true 3s sliding momentary/short-term windows per
  EBU R128 — see gap list below)
- `true_peak_db` — 4x oversampled (`_true_peak_db`, `resample_poly`)
- `dynamic_range_db` — crest factor (peak − RMS in dB), used as a dynamic-
  range proxy, not LRA
- `loudness_range_lu` — pyloudnorm's LRA when available
- `spectral_balance` — energy share across 7 bands (20Hz-20kHz), via STFT
- `stereo_width_estimate` — side RMS / mid RMS
- `stereo_correlation` / `phase_correlation` — L/R Pearson correlation
- `mono_compatibility_risk` — bool, true if summing to mono drops level >3dB
  vs. the L/R average (implies partial cancellation)
- `tempo_bpm`, `clipping_detected`, `vocal_presence_estimate`

## 6. Bus processing — where the tiers actually differ

`_bus_process` (standard) and `_bus_process_pro` (professional) share the
same glue-compression and LUFS gain-staging logic. They diverge only at the
limiter:

- **Standard**: `pedalboard.Limiter`, then a peak-safety clamp. This clamp
  now checks **true peak** (oversampled), not sample peak — that was a real
  bug found via systematic validation (see `validate_mastering.py`): sample-
  peak checking let some hiphop/edm renders out at up to +1.0dBTP, actually
  above 0dBFS. Fixed; standard tier now holds -1.0dBTP reliably. What's still
  Professional-only here: the limiter algorithm itself is `pedalboard.
  Limiter`, which applies makeup gain toward its threshold rather than pure
  gain reduction (a real quirk — see `clean_service.py`'s and this file's own
  comments on it) — the loudness guard downstream catches the net effect on
  LUFS, but it's a less controlled mechanism than pro tier's.
- **Professional**: `_true_peak_limiter` — a hand-built lookahead limiter.
  Oversamples 4x, computes required gain reduction from true peak at every
  oversampled point, anticipates peaks via a lookahead window
  (`minimum_filter1d`), smooths the *release* side only (so it can never
  under-protect, only take longer to recover), gain-only (never boosts).
  Verified via stress test: pushed a track to +10dBTP input, held output to
  exactly -1.00dBTP.
- **Professional** also gets the 5-band sub/punch split (§3) instead of one
  combined 20-250Hz band — the fix for over-compressed sub-bass.

## 7. The preset engine (`preset_dsp_engine.py`)

A second, structurally different renderer for when a preset supplies a full
`processing` JSON block (the schema in `mixing_presets.json`, or one a user
imports). It's a literal interpreter, stage by stage:

`input (headroom/auto-gain) → highpass → static EQ bands → bus compressor
(auto-thresholded from program RMS, reduction capped) → dynamic EQ (real
per-band envelope-follower + band-extract/recombine — this is genuine
level-dependent EQ, more sophisticated than anything in the adaptive engine's
static per-band EQ) → saturation (tanh waveshaper) → stereo (mid/side, hard
mono-below-Hz + per-band width) → soft clipper (oversampled tanh) →
true-peak-aware limiter (LUFS normalize + oversampled peak safety) → quality
report (true peak, phase correlation, mono compatibility, clipping)`.

Notably, this path already has a few things the adaptive engine doesn't:
real dynamic EQ, a soft clipper stage, hard low-frequency mono enforcement.
It doesn't replace the adaptive engine — it only runs when a preset asks for
it by including a `processing` block.

## 8. Other pieces (not part of the mastering signal chain)

- **Chord/key detection** (`chord_service.py`) — Essentia (tempo/key) +
  madmom (CNN+HMM chord recognition). Unrelated code path, no shared DSP.
- **Clean Audio** (`clean_service.py`) — spectral-subtraction denoise +
  pedalboard chain + adaptive noise gate, tuned for phone-recording cleanup.
  Also unrelated to the mastering chain.
- **Live preview** (`liveMasteringEngine.js`) — a client-side Web Audio
  approximation for instant slider feedback in the browser. Not used for the
  actual render; exists purely so parameter changes are audible without a
  30+ second server round-trip.
- **`validate_mastering.py`** — regression harness: runs every genre profile
  against every distinct source file in `uploads/`, checks NaN/clipping/
  true-peak-ceiling/LUFS-proximity/dynamic-range-floor. Not CI-wired, run
  manually.

## 9. Honest gap list against a "professional mastering" bar

Checked against each item, as of this document:

| Item | Status |
|---|---|
| Attack/release per compressor band | Partial — hardcoded per band-type in `_process_band`, not tunable or analysis-derived |
| Maximum gain reduction per band | Missing in adaptive engine's per-band compressors; exists for the *bus* compressor in the preset engine only |
| Dynamic EQ | Missing in adaptive engine (static EQ only); real implementation exists in preset engine |
| Adaptive spectral matching (reference track) | **Missing entirely** — no reference-track upload/match feature anywhere |
| True-peak detection | **Have it** — 4x oversampled, used in analysis and both tiers' limiters |
| LUFS-I + short-term + momentary | Partial — integrated + a short-term series exist; no spec-correct 400ms momentary window |
| Spectral tilt / reference curve | Missing — have per-band energy shares and genre targets, not a tilt metric or arbitrary reference curve |
| Stereo correlation + M/S energy analysis | **Have it** — phase correlation, stereo width estimate; M/S is core to the whole engine |
| Low-frequency mono enforcement | Partial — adaptive engine has a soft "keep ratio," not a hard cutoff; preset engine has a real hard mono-below-Hz |
| Adaptive limiter behavior | Partial — gain-staging adapts to loudness range; the limiter's own attack/release/lookahead are fixed constants, not program-dependent |
| Clipper before limiter | Missing in adaptive engine; exists in preset engine, in the right order |
| Oversampling throughout nonlinear stages | Partial — true-peak measurement and the pro limiter oversample; the saturation/Distortion stages don't explicitly |
| Dither/noise-shaping | Partial — preset engine has basic triangular dither for 16-bit output; adaptive engine always writes 24-bit, no dither path |
| Mono compatibility test | **Have it** — computed pre/post, engine even reactively narrows width if processing introduces new risk |
| Codec simulation | **Missing entirely** — `mixing_presets.json`'s schema has a `codec_preview` flag that's never implemented |
| A/B gain-matched comparison | **Missing entirely** — before/after players exist in the UI but aren't loudness-matched, so the louder one will always sound "better" regardless of actual quality |

Five items are solid, most are partial-in-one-path-not-the-other, three are
completely missing. That's the real starting point for the next round of
work — not "close" to the standard set here, but not starting from zero
either.
