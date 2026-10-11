# DSP knowledge (Level 2)

validated_commit: 85c2450 · owner: audio-dsp-engineer · reviewer: mastering-engineer
Narrative pipeline: `README.md` §"What the DSP actually does". Prior measured investigations (do not repeat without new evidence):
`docs/audits/DSP_IMPROVEMENTS.md` (tonal, dynamics/transients, limiter, reference, Standard vs Pro), `docs/audits/REGRESSION_REPORT.md`.

## Stage → code map
| Stage | Code |
|---|---|
| Input validation, DC removal, silence/short refusal | `ai_mastering/quality_control.py:validate_input_signal` |
| Analysis (LUFS, LRA, TP, crest, width, 7-band + hi-res spectrum, resonances, sibilance, sections) | `ai_mastering/analysis/*`, `band_levels.py`, `section_detection.py`, `diagnostics/problems.py` |
| Target profile (genre × tags × style × category/flavour × delivery; reference) | `params.py`, `planning/target_model.py`, `planning/preset_intent.py` |
| Plan (EQ nodes, compression, budgets) | `planning/plan.py`, `planning/budgets.py`, `planning/config.py` |
| EQ render | `processing/eq.py`, `dsp_filters.py` |
| M/S multiband, saturation, width, bus (glue, gain, TP limiter, loudness guard) | `bus_processing.py`, `processing/render.py`, `audio_utils.py` |
| Evaluation → verdict → corrective re-render (backoff) | `evaluation/evaluate.py`, `verdict.py`, `backoff.py`, `distortion.py`, `output_validation.py` |
| QC on delivered file | `quality_control.py:run_quality_control` |
| A/B report | `ab_analysis.py` |
| Engines (Standard / Professional) | `engines.py` — differ only in sub/punch compression split when the plan compresses |

## Guardrails (never weaken; changing one requires evidence + baseline rewrite in the same commit)
`output_validation.GuardrailConfig` (loudness-matched): low-end loss ≤ 2.0 dB · HF boost ≤ 2.5 dB · any band ≤ 4.0 dB ·
TP ≤ −0.8 dBTP · loudness within ±1.5 LU of target · transient loss ≤ 12 % · unplanned tilt ≤ 0.3 dB/oct ·
absolute low-end loss ≤ 4.5 dB · absolute HF boost ≤ 3.5 dB.
Planner caps (`planning/config.py`): the module-level constants are the **conservative** calibration; the ACTIVE default is
**`balanced`** (`DEFAULT_CALIBRATION`, config.py:398, overridable via `MASTERING_CALIBRATION`) — cut fraction 0.7 / boost fraction 0.6,
max cut 4 dB, max boost low 2.5 / mid 2 / high 2 dB, HF boost budget 2 dB (read `CALIBRATIONS["balanced"]` for exact values).
Always check `config.active_calibration()` before quoting a cap. (Corrected 2026-10-11, Phase 1 finding D9.) Reference EQ: boost ≤ 3/2/2.5 dB, cut ≤ 4 dB.
QC fail lines (`evaluation/verdict.py:_QC_FAIL_LIMITS`): limiter GR > 6 dB · dynamics loss > 9 · PLR < 4 dB.
Input QC: DC threshold −50 dB · silence RMS < −70 dB · min 4410 samples · channel imbalance warn 6 dB.
Benchmark failure kinds (`benchmark/metrics.py`): lost_drums, weaker_bass, harsh_highs, pumping (HF dip on kick < −1 dB).

## Known failure modes (historical, guarded)
Bass loss + HF boost (the original customer complaint) → guarded by low-end/HF/tilt limits + synthetic fixtures.
Limiter clicks, TP overshoot → re-render on TP overshoot (commit 97812f9). One dead channel → mastered as mono.
Watch item: limiter max GR reached 5.7 dB vs 6 dB QC line on one synthetic track (RELEASE_READINESS.md).

## Rules for DSP changes
1. Check `KNOWN_ISSUES.json` + this file + `TEST_BASELINES.json` first.
2. Measure before (synthetic regression + `benchmark.api_qa` on affected cases), change, measure after.
3. Run `python -m pytest -q` and the synthetic gate. Drift must be explained; rewrite baseline only in the same commit, with a DECISIONS entry.
4. Rollback = revert the commit (baseline travels with it).
5. Listening status stays PENDING until a human blind test (`benchmark/blind_ab.py`).

## Phase 1 findings (2026-10-11) — evidence: docs/agent-reports/DSP_PHASE1_INVESTIGATION.md
Punch loss on real/synthetic material comes mainly from the **bus limiter** (scales with GR) and **genre-default saturation**, not compression
(off on all real tracks) and not EQ. Longer lookahead makes it worse. The engine **adds** bass at matched loudness on both real tracks (bass-loss
hypothesis rejected). No automatic 2–5 kHz or HF boosts observed. Open defects: AUDIO-001 (units), -002 (polarity), -007 (saturation), -008 (TP ceiling), -009 (no loudness/quality trade), -010 (sub-40 Hz boost).
