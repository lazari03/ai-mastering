"""# Adaptive mastering engine (plan-driven)

The engine asks: *what measurable problems does this recording have, how
sure are we, how much change can it tolerate, what does the selected
genre/style/reference say about the acceptable destination, and what is the
smallest plan that gets there without damaging what is already good?*
After rendering it asks: *did that actually happen, and did anything else
get worse?*

```
SOURCE
 → analysis/            measurement (one shared STFT, loudness, dynamics)
 → SourceProfile        analysis/profile.py
 → diagnostics/         problems with severity / confidence / evidence
 → planning/            target context, confidence gates, budgets
 → MasteringPlan        planning/plan.py (JSON, every decision has a reason)
 → processing/          render only what the plan enables
 → evaluation/          post-master analysis, expected vs actual, stage blame
 → ≤ 1 backoff render   evaluation/backoff.py (only ever reduces processing)
 → final master
```

| Responsibility | Module |
|---|---|
| Tunable constants (all of them) | `planning/config.py` |
| Hi-res spectrum, stereo per region, resonances, sibilance, codec cutoff | `analysis/spectral.py` |
| Vectorised BS.1770 loudness / LRA / series | `analysis/loudness.py` |
| Peak percentile, clipping runs, BPM confidence | `analysis/dynamics.py` |
| `SourceProfile` + descriptive scores | `analysis/profile.py` |
| `Problem` detection | `diagnostics/problems.py` |
| Genre/style/category/tags/reference → acceptable destination | `planning/target_model.py` |
| Change budget, limiter damage budget, compression need | `planning/budgets.py` |
| `EQDecision`, `DynamicEQDecision`, `MasteringPlan` | `planning/plan.py` |
| RBJ EQ used for BOTH prediction and rendering | `processing/eq.py` |
| Plan-driven render + per-stage measurement | `processing/render.py` |
| `MasterEvaluation` | `evaluation/evaluate.py` |
| Single bounded backoff | `evaluation/backoff.py` |
| Legacy `processing_params` view, public entry points | `mastering_params.py`, `mastering.py` |

## Key rules

* **Tonal problems are clusters of hi-res bands** outside a tolerance window
  around the target curve, in the same direction. "55–90 Hz healthy" and
  "160–300 Hz excessive" stay separate facts.
* **Confidence** = magnitude beyond the window × temporal persistence
  (fraction of ~1.5 s segments that agree) × measurement reliability (FFT
  bins per band, content above noise floor, lossy-codec cutoff).
* **Asymmetric gates** (`REQUIRED_CONFIDENCE`): cut 0.42 < low boost 0.58 <
  mid boost 0.66 < HF boost 0.74. HF boosts are additionally blocked when
  the source is already bright/harsh against the neutral curve.
* **EQ constraints** are checked on the exact filter response: never push a
  band diagnosed in the opposite direction, protect healthy 40–120 Hz from
  neighbouring cuts, a cumulative HF-boost budget across ALL filters, and a
  source-identity change budget (boosts give way first).
* **Compression is optional**: enabled only when the acceptable loudness
  range cannot be reached with the limiter inside its damage budget
  (micro), or LRA is wide for the genre (macro). Thresholds are relative to
  the band's own RMS, attack follows transient health, release follows a
  tempo subdivision only when BPM confidence ≥ 0.5.
* **Loudness is a range** (`preferred / acceptable_min / acceptable_max`).
  Gain is capped so limiter gain reduction on the loud hits stays inside
  the source-dependent budget; a quieter master inside (or even below) the
  range is accepted rather than crushing transients. A source already
  inside the range at/above preferred is left at its level.
* **Genre never prescribes a DSP move.** The genre's 7-band shares are used
  relative to the cross-genre mean (±2 dB max) on top of a neutral curve;
  tags and category `tweak_bias` shift the target and narrow the tolerance
  on the requested side; a reference moves the target 60% toward its
  octave-smoothed curve. User sliders become explicit `user_tweak` EQ
  decisions (confidence 1.0, hard-bounded, conflicts noted).

## Diagnostics

`master_track()` returns (and `processing_applied` carries):

```json
"mastering_diagnostics": {
  "engine": "adaptive_plan_v2",
  "source_profile": {...},
  "detected_problems": {...},
  "mastering_plan": {... eq_decisions, rejected_decisions, compression, ...},
  "render": {... per-stage info ...},
  "evaluation": {... regions, collateral, flags, stage_contributions ...},
  "backoff_applied": false,
  "backoff": {...},
  "renders": 1
}
```

`mastering_plan.rejected_decisions` records every decision NOT taken and
why (e.g. `"No EQ for insufficient_air: confidence 0.61 below boost_high
gate 0.74"`, `"compression: need 0.00 … limiter alone reaches -11.9 LUFS"`).

## Schema changes (additive unless noted)

* `analysis` (from `/analyze`, `analysis_before/after`) gains
  `source_profile` and `tempo_confidence`. `/preview-params` now requires the
  analysis to contain `source_profile` (re-run `/analyze` for analyses cached
  from an older engine; a clear 400 is returned otherwise).
* `processing_params` gains `mastering_plan`, `compression_enabled`,
  `limiter_budget_db`, `loudness_range`, `category_tweak_bias_mode`.
  `per_band_gain_changes_db` keeps its 7 keys but is now the response of
  the filters actually rendered. `band_diagnosis` is keyed by hi-res band.
  `vocal_presence_gain_db` is always 0 (superseded by problem detection).
* `processing_applied` gains `eq_decisions`, `dynamic_eq`,
  `compression_enabled`, `loudness_range`, `mastering_diagnostics`.
  `section_automation` is `null` and `post_render_overshoot_corrections` is
  `[]` (both behaviours removed — see below).
* `compute_processing_params(...)` gains optional `tier` and
  `reference_relative_db` keyword arguments.

## Behaviour removed

* Fixed moves on every track: +0.5 dB 60–250 Hz, −0.35 dB 250–500 Hz,
  chorus air-shelf and width automation, always-on multiband/glue
  compression, category `tweak_bias` applied as direct EQ.
* `target − source` share differences mapped straight into EQ.
* Share-based post-render "overshoot" trim (known to misfire) and the
  separate transient-only rerender (both replaced by evaluation + backoff).
* Dynamics "recovery" blend of unprocessed pre-master back into the master.
* Defects fixed along the way: the multiband split summed to −4…−6 dB
  around every crossover (now perfect reconstruction), and the standard
  tier's `pedalboard.Limiter` hid a 4:1 compressor at −10 dBFS (≈ −4 dB at
  55–120 Hz, ~40% drum-punch loss); both tiers now use the gain-only
  true-peak limiter.
"""

from .audio_utils import ANALYSIS_BANDS, EPS, MASTER_SR, PROCESS_BANDS, analyze_track
from .mastering import analyze_for_preview, master_track, preview_processing_params

__all__ = [
    "EPS",
    "MASTER_SR",
    "ANALYSIS_BANDS",
    "PROCESS_BANDS",
    "analyze_track",
    "master_track",
    "analyze_for_preview",
    "preview_processing_params",
]
