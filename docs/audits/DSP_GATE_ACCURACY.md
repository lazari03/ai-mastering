# Production gate accuracy — Phase 2 (dsp-gate-accuracy)

Owner: audio-dsp-engineer · reviewer: mastering-engineer · listening status: **PENDING** (objective evidence only).
Issues: AURALITH-AUDIO-007, -008, -009, -001, -010, QA-005 (production side). Phase 1 baseline: `docs/audits/METRIC_VALIDATION.md` (commit 0526e98).

## How this was measured

| evidence | command | before | after |
|---|---|---|---|
| Defect-corpus scorecard (208 pairs, 16 controls) | `python -m benchmark.metric_validation` | committed `test-results/metric_validation.json` @0526e98 | same harness on the new gate (scratch output, not committed: the scorecard files belong to QA) |
| Engine renders | every candidate `master_track` rendered for the 21 synthetic-regression tracks + 31 API-lab inputs (63 candidates) captured and re-judged | — | 0 of 63 trip any new check (margins below) |
| Synthetic regression gate | `python -m benchmark.regression --synthetic --baseline benchmark/baselines/synthetic.json` | drift 0 | **drift 0** (same delivered candidates, same first-render failures, same warnings) |
| API lab | `python -m benchmark.api_qa --force` (uvicorn, real `/master`) | 28 PASS · 3 PWA · 2 FAIL | 25 PASS · 6 PWA · 2 FAIL — **delivered audio bit-identical on every case; no new refusal** (see API lab) |
| Unit tests | `tests/test_gate_accuracy.py` (19) | 15 of the first 17 fail on the parent (the 2 that pass pin the false-positive side) | all pass |

The gate checks do not alter delivered audio unless they fire; none fired on any engine render, so no baseline was rewritten.

## Scorecard: production gate blocks, before -> after (excluding the loudness-level detector)

| class | dose | before | after | detector that now sees it |
|---|---|---|---|---|
| clip_burst (300 ms) | 0.05 / 0.2 / 0.5 | 0/4 · 0/4 · 0/4 | 0/4 · **4/4 · 4/4** | distortion_burst |
| clip_distortion | 0.005 | 0/4 | **3/4** | crest_collapse (peak loss w/o loudness) |
| transient_smear_section | 3 / 6 / 9 dB | 0/4 · 0/4 · 1/4 | 0/4 · **1/4 · 3/4** | section_transient_loss, distortion_burst |
| transient_smear (global) | 6 dB | 3/4 | **4/4** | section_transient_loss |
| pumping | 1 / 2 / 4 dB | 0/4 · 1/4 · 4/4 | 0/4 · **3/4** · 4/4 | pumping |
| crest_crush | 2 dB | 3/4 | **4/4** | crest_collapse (8/12 overall, was 0/12) |
| range_crush | 3 / 6 / 12 | 0/4 · 1/4 · 1/4 | **1/4** · 1/4 · 1/4 | lra_collapse (loss rule) |
| excess_width | +6 / +12 / +18 dB | 0/4 · 4/4 · 4/4 | **4/4** · 4/4 · 4/4 | mono_compatibility (fail) |
| phase_cancel | 0.25 | 0/4 | **4/4** | mono_compatibility |
| dc_offset | 0.02 / 0.1 | 2/4 · 4/4 (via FAKE transient_loss) | 4/4 · 4/4 (via qc.dc_offset fail) | right reason now |
| all other classes / doses | | | unchanged | |

* **Controls (identity, ±3 dB gain, mono fold, incl. bass-heavy): 0/16 blocked before and after; no new check fires on any control.**
* No class/dose got a lower block rate. Detector-level changes: only increases on the targeted classes, plus eval/guardrail `transient_loss` no longer firing on DC (6/12 and 5/12 -> 0/12, the QA-005 false reason).
* Magnitude: the windowed distortion estimate of a 300 ms clip burst is within mean 2.9 dB (max 4.4) of the injected in-burst residual; the song-wide `worst_db` it replaces for bursts was 23 dB off (that key is unchanged for back-compat, so the harness magnitude row for clip_burst still reads 23.2 — QA can point it at `window_worst_db`). Production `pumping_db` matches the injected kick-grid HF dip within mean 0.15 dB (max 0.33).
* The harness's `RELEVANT` mapping does not yet list the new verdict kinds (`distortion:distortion_burst`, `distortion:pumping`, `distortion:section_transient_loss`); their TPR above is computed from per-case `verdict_kinds`. Handoff to QA to add them.

## Engine renders: headroom of every new check (63 candidates)

| check | limit | worst delivered candidate | worst any candidate |
|---|---|---|---|
| window_worst_db (distortion_burst) | > -12 dB | -17.2 (boomy_extreme_trap corrective) | -15.6 (its failed initial) |
| pumping_db | > 1.5 dB | 0.73 (bass_heavy_hiphop) | 1.01 (boomy initial) |
| section_attack_loss_db | > 2.5 dB | 1.65 (boomy corrective) | 1.94 (boomy initial) |
| excess peak reduction | > 2.5 dB | 0.04 | 0.04 |
| LRA loss | ≥ 1.5 LU and ≥ 25 % | 0.32 LU | 0.32 LU |
| side-to-mid rise | > 3 dB (side audible) | +1.05 dB | +1.05 dB |
| residual DC (QC fail) | > -40 dBFS | n/a: master_track removes DC > -50 dBFS before QC | |

Real-music corpus: **BLOCKED** (absent, AURALITH-QA-001). Thresholds sit between the corpus doses and the engine maxima at the musically meaningful values given in `DSP_KNOWLEDGE.md`, not at the doses.

## Changes, one by one (each behind a `planning/config.py` switch; `False` restores the parent behaviour exactly)

### 1. QA-005 — DC-free punch (`TRANSIENT_DC_REMOVAL`) + DC fails for the right reason (`DC_OFFSET_FAIL_CHECK`, `QC_DC_OFFSET_FAIL_DBFS=-40`)
`audio_utils._transient_metrics` removes the mean before the 10 ms envelope (punch score, short-term crest). Before: 0.02 FS DC read punch loss 0.28 and tripped eval+guardrail `transient_loss` with no punch lost. After: 0.000. QC `dc_offset` now fails above -40 dBFS (1 % FS); master_track strips DC > -50 dBFS before QC, so production cannot reach it. Tests: `test_dc_offset_does_not_read_as_lost_punch`, `test_dc_contaminated_master_fails_qc_for_the_right_reason`, `test_dc_switch_restores_parent_measurement`.

### 2. AUDIO-007 — short distortion bursts (`WINDOWED_DISTORTION_CHECK`, `MAX_WINDOW_DISTORTION_DB=-12`, 400 ms windows, 200 ms hop)
`evaluation/distortion.py` reports the residual-to-master ratio of the worst 400 ms window of loud frames (`window_worst_db`, `window_worst_at_s`); the verdict fails `distortion_burst` (domain distortion, correctable: nonlinear stages, then limiter drive). clip_burst 0/12 -> 8/12 (the 5 % clip-rate dose, in-burst residual -11..-17 dB, stays below the line). Tests: `test_300ms_clip_burst_is_caught_per_window`, `test_linear_and_level_changes_have_no_windowed_distortion`, `test_windowed_distortion_switch`.

### 3. AUDIO-007 — section-local transient loss (`SECTION_TRANSIENT_CHECK`, `MAX_SECTION_ATTACK_LOSS_DB=2.5`, 3 s windows, 1 s hop, ≥ 3 onsets)
Onsets are fixed on the SOURCE (10 ms envelope rise > 6 dB, 6 dB above the sustained level); at each, master/source gain on the attack (0-20 ms) over gain on the body (40-150 ms). Level, EQ and slow gain riding cancel; uniform limiting scores ~0 because the check is worst window minus song median. Why not a windowed punch score: tried and rejected — per-window punch flips onsets in and out (a 1 dB pumping on edm read -0.35) and flagged the engine's own c03 render at -0.29. Ground truth caveat: the corpus "transient smear" changes kick attack peaks by only -0.0..-2.0 dB (independent `measured_attack_depth_db`), comparable to normal limiting, so most of the 3-6 dB doses are not separable from a good master; hiphop's section case measures 0.0 dB on kicks. Section 1/12 -> 4/12. Tests: `test_section_transient_smear_is_caught_and_located`, `test_uniform_attack_softening_is_not_a_section_problem`.

### 4. AUDIO-008 — pumping in the production verdict (`PUMPING_CHECK`, `MAX_PUMPING_DB=1.5`)
Same construction as `benchmark.metrics.pumping_db` (2-8 kHz master-vs-source change on the frames where the source's 40-120 Hz band is in its top 10 % vs its quietest half) on the aligned signals. Fails `pumping` (dynamics, relief ladder). pumping 5/12 -> 7/12 blocked (dose 2: 1/4 -> 3/4); also sees the fast-limiter crest_crush cases (genuine ducking). Tests: `test_kick_correlated_ducking_is_pumping[2,4]`, `test_static_gain_and_eq_are_not_pumping`.

### 5. AUDIO-008 — crest / LRA respond to real crush (`EXCESS_PEAK_REDUCTION_CHECK` 2.5 dB; `LRA_LOSS_CHECK` 1.5 LU & 25 %)
`crest_collapse` also fires when peaks were reduced more than reaching this loudness under this ceiling required: `min(PLR loss, ceiling - master TP)`. A master limited to its ceiling scores ~0 however hard it limits (limiter budget / short-term crest rule judge that); crushing while headroom is left unused scores the crush. eval.crest_collapse on crest_crush 0/12 -> 8/12. `lra_collapse` also fires on ≥ 1.5 LU and ≥ 25 % LRA loss (old rule needed > 3 LU source and 50 % loss): range_crush 2/12 -> 3/12. Not lowered further on purpose: the pop/edm/hiphop references have LRA ~2-3 LU and a 12:1 slow compressor removes only 0.4-1.4 LU there, inside normal master-to-master variation. QC `plr` (< 4 dB) and `dynamics_preservation` (> 9 dB) lines unchanged. Tests: `test_peak_crush_without_loudness_gain_fails_crest_collapse`, `test_range_crush_on_dynamic_material_fails_lra`.

### 6. AUDIO-009 — excess width / mono fold-down (`WIDTH_CHECK`, side rise 3 dB with side > -20 dB re mid, or mono fold-down loss +1.5 dB)
QC `mono_compatibility` fails (domain stereo, correctable: backoff resets side gain like `unsafe_correlation`) when processing raised side-to-mid by > 3 dB (the planner's maximum widening is 1.5 dB + 0.7 dB user tweak) or the mono fold-down loses 1.5 dB more than the source's. Source-relative, so a wide or out-of-phase SOURCE is not blamed (phase_correlation still reports it). excess_width +6 dB 0/4 -> 4/4; phase_cancel 0.25 0/4 -> 4/4. Tests: `test_side_boost_fails_mono_compatibility`, `test_width_rule_is_source_relative`.

### 7. AUDIO-001 — transient-loss units reconciled (no threshold moved)
The engine's checks (eval `allowed_loss` 0.04-0.22, guardrail `max_transient_loss` 0.12) are ABSOLUTE punch-score deltas; the "12 % fraction" in the docs was wrong. Code/docs now say so, the evaluation report adds `loss_fraction`, and the guardrail detail names the unit. Moving the guardrail to a true 12 % fraction would re-render 8 of 48 delivered synthetic-regression/API-lab masters (fractions 0.120-0.206: c03 0.206, short_3s 0.155, rnb 0.129, c16 0.126, f06 0.125, c19b 0.122, c04 0.122, c17 0.120) — a listening decision for mastering-engineer, not a unit fix. Test: `test_transient_report_states_both_units`.

### 8. AUDIO-010 — the two strict xfails from QA phase 2 resolved (both intended plan moves; no limit loosened)
Determined from the engine's plan for the exact fixtures (`tests/test_benchmark_regressions.py`, seed 11, 16 s):
* **bass_heavy (+6.5 dB 40-250 Hz):** plan = bell 95 Hz −2.44 dB (Q 0.59). Kick-bass re midrange: planned −2.16 dB of the measured −2.86 dB; unplanned −0.70 dB (guardrail limit 2.0). The master is still ~3.6 dB bassier than neutral — the boom correction, not "weaker bass".
* **bright (+6.5 dB 2.5-9 kHz):** plan = bell 5.07 kHz −2.45 dB. Punch 0.609 (source) -> 0.597 (source through the planned EQ only) -> 0.530 (master): of the 0.130 loss, 0.020 is the planned de-harshing softening hat/snare attacks, 0.112 is the bus (limit 0.12). Benchmark residual DC removal (QA-005) only exposed this.
Fix: `benchmark.metrics.compare(..., planned=)` (optional; default unchanged). Bands: judges the UNPLANNED movement against the planned-EQ rendering, like the production guardrails, with their absolute caps on total movement (4.5 dB bass down / 3.5 dB highs up). Punch: the fraction lost vs the planned rendering (limit 0.12) AND — after audit finding F1 — the production guardrail's own plan-independent cap: the ABSOLUTE punch-score drop source -> master (DC-free, loudness-matched) may not exceed 0.12, so no planned EQ can excuse a large punch loss (`test_compare_plan_aware_cannot_excuse_large_absolute_punch_loss`). The test passes the plan's own EQ (`processing_applied.eq_decisions`); xfail markers removed. Tests: `test_compare_plan_aware_excuses_planned_eq_only`.

**Why production passes `bright` while the benchmark's total reads 0.13 (audit F1):** it is not a measurement difference — on the same audio both compute the same scores (source 0.609, master 0.530; DC-free in both since this branch; the heard-failures test now asserts the benchmark's absolute drop equals the engine's reported `transients.delta` within 0.01). The difference is the unit: the benchmark's `lost_drums` divides the 0.079 drop by the source score (0.130), the production guardrail judges the 0.079 drop itself against 0.12 (AURALITH-AUDIO-001). Mastering-engineer reviewed and approved keeping the absolute 0.12 (recorded as DECISIONS D-007), so `bright` passes the absolute cap honestly (0.079 < 0.12), and the test pins the true values (`punch_loss` 0.130 ± 0.015, absolute < 0.12) against that decision rather than hiding them. Bus share 0.112 of the 0.12 fraction stays a watch item.

### 9. Audit follow-ups
* F2: each detector in `distortion.py` is computed only when its switch is on (switched off = the parent's computation and dict keys; `test_switched_off_detectors_are_not_computed`).
* F4 (pre-existing on main): a 0.3 s upload crashed analysis with a raw `IndexError` (empty 400 ms short-term/LRA series). `validate_input_signal` now refuses input shorter than 0.5 s with `InvalidAudioError` (-> HTTP 400 `invalid_audio`); `test_too_short_input_is_refused_cleanly`. 0.5 s and longer are unchanged (c16 2 s still masters).

## API lab detail

Every case's delivered master is **bit-identical** before/after (compared sample by sample). Status changes are benchmark-side only: c04, c17, c19b go PASS -> PASS_WITH_ANOMALIES (`lost_drums` 0.122/0.120/0.122, f06 0.124 -> 0.125) because `benchmark.metrics` reads punch through the shared `_transient_metrics`, which no longer lets the masters' −62..−64 dBFS residual DC inflate the master's punch (the same QA-005 correction QA made benchmark-side; the API lab here still ran QA's pre-merge metrics). These are the AUDIO-001 cases above (fraction ≈ 0.12); the API lab's `compare` is not plan-aware yet (c04 is a harsh-highs fixture like "bright"). FAIL cases unchanged and pre-existing: c09 (AUDIO-002) and f04 (route now sends `X-Error-Code: invalid_request`, harness expects none — contract drift, not DSP).

## Rollback
Per check: set its switch in `backend/ai_mastering/planning/config.py` to `False` (`TRANSIENT_DC_REMOVAL`, `DC_OFFSET_FAIL_CHECK`, `WINDOWED_DISTORTION_CHECK`, `SECTION_TRANSIENT_CHECK`, `PUMPING_CHECK`, `EXCESS_PEAK_REDUCTION_CHECK`, `LRA_LOSS_CHECK`, `WIDTH_CHECK`). What that restores exactly:
* **Pass/fail decisions and corrective re-renders:** identical to the parent for that check (each rule is a single `if C.<SWITCH> and ...` branch).
* **Computation/payload switched off with it:** the three comparator detectors are not computed and their `distortion` keys are absent; `dynamics.excess_peak_reduction_db` is absent; QC `mono_compatibility.value` is `None` again (quality_control.py).
* **Fields that remain regardless (reporting only, never decide anything):** `transients.loss_fraction` and the guardrail `transient_loss` detail wording naming the unit (output_validation.py) — the AUDIO-001 unit documentation; the backoff mapping `mono_compatibility -> unsafe_correlation` (inert unless that kind fails); the 0.5 s minimum input length (F4 fix, not a gate check; revert its commit to undo).
Whole change: revert the gate, AUDIO-010 and audit-follow-up commits. No baseline was rewritten, so nothing else travels with the revert.
