# Chip effect contracts (specification for DSP implementation and QA)

Author: mastering-engineer (domain review). Status: PROPOSAL, listening PENDING.
Inputs read: `backend/params.py` (tags, styles, categories, flavours, delivery), `ai_mastering/planning/plan.py::apply_user_tweaks_to_plan`, `ai_mastering/mastering_params.py::_apply_user_tweaks`, `benchmark/metrics.py::compare`, `benchmark/regression.py::measure`, `ai_mastering/output_validation.py::GuardrailConfig`, `docs/agent-reports/CHIP_EFFECTS.md`, issues AURALITH-AUDIO-011 and -012.

Labelling rule. Every number below is a DESIGN TARGET (HYPOTHESIS) derived from general psychoacoustic reasoning and mastering practice. None is HUMAN-VERIFIED. Every "currently" figure is VERIFIED (measurement) from CHIP_EFFECTS.md, one real pop track only. The minimum sizes must be confirmed or revised by a blind loudness-matched listening session (`backend/benchmark/blind_ab.py`) before they are frozen.

## 0. Why most chips do nothing today (observations, not root-cause proof)

- OBSERVED in code: `mastering.py::preview_processing_params` states that category/flavour `tweak_bias` is no longer merged into the sliders; it "shifts the target context" only. So the `tweak_bias` values on every category and flavour cannot force a move, which fits the near-zero results for most of them. HYPOTHESIS: the target model then pulls the result back toward its own destination.
- OBSERVED in code: `tweak:low_end` adds a 100 Hz low shelf of `1.2 dB x v`, and `tweak:punch` only edits multiband ratio/attack when `multiband.enabled`. CHIP_EFFECTS shows low_end=+1 produced no low-band change (-0.02 dB) and punch produced exactly 0.00. HYPOTHESIS: loudness/spectral normalisation downstream cancels the shelf, and multiband was disabled for this source. The engineer must confirm.
- OBSERVED: loudness chips are inverted (AUDIO-011). Explicit `loudness` shifts `desired_lufs` but `target_lufs` is clamped by `achievable_lufs_by_budget`; louder tag and `modern` category lower LUFS because their `target_lufs_delta` is negative and `compression_aggression_delta` is positive.
- Several controls are byte-identical renders (listed in CHIP_EFFECTS): `wider` = `better_vocals` = `delivery:auto` = `tier:professional` = no-op; `softer` = `dynamic` = `streaming_safe` = `cd_loudness_war` = `acoustic_natural` = `cinematic_score` (the same +0.76 LU render); `clean` = `rock_modern` = `delivery:loud` = `tweak:loudness=+1`.

## 1. Inventory by musical dimension

"Today" = measured max |loudness-matched band move| and LUFS move vs baseline on pop-before (VERIFIED, one track). "Biases" = what params.py sets.

| Dimension | Control | Biases (params.py) | Today (VERIFIED) |
|---|---|---|---|
| Loudness | tag louder | target_lufs -1.5, compression +0.4 | LUFS -1.52 (INVERTED) |
| Loudness | tag softer | target_lufs +1.5, compression -0.5, width -0.05 | LUFS +0.76, crest -0.73 (INVERTED vs "softer" if read as quieter; it gets louder) |
| Loudness | tweak loudness +/-1 | desired_lufs +/-1.25 LU | +1: +0.39; -1: -1.29 |
| Loudness | delivery auto/streaming/apple/loud | reference -14/-16, loud +1 LU | auto 0.00; streaming -3.88; apple -5.88; loud +0.39 (target +1.0) |
| Dynamics / density / era | 16 styles: modern, rock_90s, rock_2000s, rock_modern, electronic_modern, stock_mastering_strip, vintage_analog, cd_loudness_war, vinyl_master, streaming_safe, hiphop_golden_era, hiphop_modern_trap, pop_80s, edm_festival, acoustic_natural, cinematic_score | target_lufs, dynamic_range, width, saturation, hf_cap deltas | LUFS -1.94 .. +1.53; many identical |
| Dynamics / density | categories clean, modern, dynamic | LUFS, DR, compression, saturation | clean +0.39, modern -0.62, dynamic +0.76 |
| Punch | tag punchier_drums | +0.8 dB bass_60_250, +0.5 dB high_mid_2000_4000, compression -0.2 | max band 0.36 dB, crest -0.05 |
| Punch | tweak punch +/-1 | multiband ratio -0.18*v, attack +10*v ms on low/punch/low_mid bands | 0.00 / 0.00 |
| Punch | category punch (+flavours transient, impact, forward), club (+powerful, deep, aggressive), modern flavour punchy, bass_control flavour tight | tweak_bias punch 0.15 - 0.5 (inert, see section 0) | 0.07 - 0.58 dB, mostly via LUFS/crest side effects |
| Low end | tag deeper | +1.5 sub, +1.0 bass, -0.5 low_mid | max band 0.44, low +0.37 |
| Low end | tweak low_end +/-1 | low shelf 100 Hz, 1.2 dB * v | +1: low -0.02 (fails); -1: low -0.85 |
| Low end | category bass_control (+tight, controlled) | tweak_bias low_end -0.35, punch 0.2 | 0.07 (none) |
| Warmth | tag warmer | +1.5 low_mid, -1.0 brilliance, saturation +0.08 | max band 0.79, high -0.29, LUFS -0.11 |
| Warmth | tweak warmth +/-1 | bell 250 Hz 0.8*v dB, high shelf 10 kHz -0.25*v | 0.40 / 0.41 dB |
| Warmth | category warm (+analog, smooth, saturated) | saturation +0.10, hf cap -0.2 | 0.18 dB; smooth = warm |
| Brightness | tag brighter | +1.5 presence, +2.0 brilliance | max band 0.31 |
| Brightness | tweak brightness +/-1 | high shelf 8 kHz 0.8*v | 0.48 / 0.48 (high -0.03 for -1) |
| Brightness | category bright (+airy, crisp) | hf cap +0.4 | 0.11 - 0.31 |
| Presence / vocal | tag better_vocals | vocal_presence +0.02, presence +1.5, de-esser 0.5 | 0.00 (no-op) |
| Presence / vocal | tweak presence +/-1 | bell 3 kHz 0.8*v | 0.48 / 0.50 |
| Presence / vocal | category vocal_focus (+intimate, present) | vocal_presence +0.03 | 0.36 - 0.40 |
| Clarity | tag clearer | -1.5 low_mid, +1.0 presence | max band 0.37 |
| Width | tag wider | max_stereo_width +0.15 | 0.00 (no-op) |
| Width | tweak width +/-1 | side gain 0.7*v dB | +/-0.69 dB (works) |
| Width | flavour dynamic/wide | width +0.08, tweak_bias width 0.2 | identical to dynamic |
| Quality tier | tier professional | n/a | 0.00 on this input |

## 2. Reduced chip set

Principle: one user-facing control per musical dimension; every legacy field keeps working (no API field removed). Tags, categories, flavours and non-kept styles become ALIASES that resolve, before planning, to a vector of the kept controls (a "chip resolution" step in mastering_params.py or the gateway). The DSP then has exactly one code path per dimension, so the one contract per dimension is the whole test surface.

Chip semantics: a chip is the same control at full scale (v = +1 or -1). Sliders are continuous v in [-1, +1] and the effect must scale monotonically with |v|. Aliases add to explicit slider values and clip at +/-1.

### 2.1 Kept controls (10)

| # | Kept control | API field (unchanged) | UI form |
|---|---|---|---|
| K1 | loudness | tweaks.loudness | slider / "Louder" "Softer" chips |
| K2 | era_density (dynamics character) | style | 4-way: modern (default), open, dense, vintage |
| K3 | punch | tweaks.punch | slider / "Punchier drums" chip |
| K4 | low_end | tweaks.low_end | slider / "Deeper bass", "Tighter bass" chips |
| K5 | warmth | tweaks.warmth | slider / "Warmer" chip |
| K6 | brightness | tweaks.brightness | slider / "Brighter" chip |
| K7 | presence | tweaks.presence | slider / "Better vocals" chip |
| K8 | clarity | tags: clearer | chip (low-mid cleanup; no slider exists, not needed) |
| K9 | width | tweaks.width | slider / "Wider" chip |
| K10 | delivery | delivery | 4-way: auto, streaming, apple, loud |

Genre and Standard/Professional tier are not chips (genre selects the target profile; tier is a quality mode and must be sold on measured differences, see 3.11).

### 2.2 Removed or merged (53) and where each goes

Tags (8):
- better_vocals -> K7 presence +1 (plus de-esser guard, part of the K7 contract)
- deeper -> K4 low_end +1
- brighter -> K6 brightness +1
- warmer -> K5 warmth +1
- louder -> K1 loudness +1 (must obey K1 contract; today inverted)
- softer -> K1 loudness -1 AND K2 open (quieter and less compressed)
- wider -> K9 width +1
- punchier_drums -> K3 punch +1
(clearer stays as K8.)

Categories (9; all keep the API name, resolve to a vector):
- clean -> K2 modern, saturation 0 (transparent), no other move
- modern -> K2 dense (small), K3 punch +0.15
- dynamic -> K2 open
- punch -> K3 punch +0.5
- club -> K2 dense, K4 low_end +0.15, K3 punch +0.4
- warm -> K5 warmth +0.4
- bright -> K6 brightness +0.4
- vocal_focus -> K7 presence +0.35
- bass_control -> K4 low_end -0.35, K3 punch +0.2

Flavours (24; each = parent resolution plus one extra kept-control nudge or nothing):
- clean: transparent, balanced -> clean (identical measured); detailed -> clean + K7 +0.15
- modern: competitive, dense -> K2 dense; punchy -> K3 +0.2
- dynamic: open, natural -> K2 open; wide -> K2 open + K9 +0.2
- punch: transient -> K3 +0.15; impact -> K4 +0.1; forward -> K7 +0.15
- club: powerful -> K4 +0.15; deep -> K4 +0.3; aggressive -> K2 dense
- warm: analog, smooth, saturated -> K5 (strength 0.4 / 0.3 / 0.5)
- bright: airy, crisp -> K6 (+0.2 / +0.15, crisp also K7 +0.15)
- vocal_focus: intimate -> K7 with K1 -0.1; present -> K7 +0.2
- bass_control: tight -> K3 +0.15; controlled -> K4 -0.1

Styles (12 of 16 merged; the four kept are exposed in UI, all 16 names stay valid in the API):
- Kept: modern (K2 default), acoustic_natural (K2 open), electronic_modern (K2 dense), vintage_analog (K2 vintage: lower density, softer top, tape saturation).
- Merged: rock_modern, rock_2000s, pop_80s, stock_mastering_strip, hiphop_golden_era -> modern; rock_90s, vinyl_master, streaming_safe, cinematic_score -> open (streaming_safe is also "delivery:streaming" intent, so it should map to K10 streaming); edm_festival, hiphop_modern_trap, cd_loudness_war -> dense.

Count: kept 10, removed or merged 8 + 9 + 24 + 12 = 53.

## 3. Effect contracts

Common measurement protocol (all contracts):
1. Render the same input twice with identical genre, style, tier and all other controls: DEFAULT and TEST (control at v = +1 and v = -1; also v = +/-0.5 for the monotonicity check). Same seed/deterministic path.
2. Compare TEST against DEFAULT (not against the source), loudness-matched with the existing gain match in `benchmark/metrics.py::compare` (call `compare(default, test, sr)`; its `band_deltas_db`, `punch_*`, `pumping_db` are then relative to default). Exception: K1 and K10 are judged on un-matched integrated LUFS by definition.
3. Orthogonality: on the non-target dimensions the move must be at most 50 percent of the on-axis move or 0.5 dB / 0.5 LU, whichever is larger (a punch chip may not change tilt, etc.), except the declared side-effects listed per contract.
4. Monotonic and symmetric: effect(0.5) is between 30 and 80 percent of effect(1.0); the sign of effect(-1) is opposite to effect(+1).
5. Every request must come back with a per-control status in the job report (proposed field `chip_report`: `[{control, requested, achieved_measure, status: honoured|partial|not_honoured, reason}]`). Nothing silent.
6. Existing guardrails (`GuardrailConfig`) are never relaxed. Defaults: max_low_end_loss 2.0 dB, max_high_boost 2.5 dB, max_any_band 4.0 dB, true peak -0.8 dBTP (and -1.0/-2.0 per delivery rule), loudness tolerance 1.5 LU, max_transient_loss 0.12 of source punch, tilt drift 0.3 dB/oct unplanned, absolute low loss 4.5 dB, absolute high boost 3.5 dB, pumping > -1.0 dB.

"Planned-move allowance": `output_validation` applies the per-band and tilt limits to UNPLANNED movement (measured minus the plan's EQ-only prediction). A user-requested EQ move is in the plan (source `user_tweak`), so it counts as planned provided it is in `planned_band_deltas_db`. Each contract therefore says what the plan must declare. The absolute (total) caps still apply regardless.

New metrics needed (specified precisely, no listening claim):
- N1 `tilt_db_per_oct(band_deltas)`: least-squares slope of the loudness-matched band deltas against log2(centre frequency), 35 Hz - 20 kHz. The code already exists as `unplanned_tilt_db_per_oct` (regression.py); reuse it on TEST-vs-DEFAULT total deltas.
- N2 `side_mid_delta_db`: 20log10(RMS(S)/RMS(M)) of TEST minus DEFAULT, full band, and separately below 120 Hz. (Same quantity CHIP_EFFECTS already uses as "width".)
- N3 `mud_index`: mean band level 250-500 Hz minus mean level 2-5 kHz, TEST minus DEFAULT, loudness-matched.
- N4 `attack_ratio`: median over detected drum onsets of (peak of 5 ms RMS after onset) / (RMS of the following 100-250 ms), in the 60-120 Hz and 2-5 kHz bands, TEST divided by DEFAULT at matched loudness. Complements `drum_punch_estimate`, which saturates on dense material.
- N5 `sibilance_delta_db`: level change of the 6-9 kHz band during frames where the 6-9 kHz band is within 10 dB of its 95th percentile (vocal/hat sibilant frames), TEST minus DEFAULT.

JND reasoning used for sizes (general psychoacoustics, to be confirmed by listening): a broadband level or tilt change is reliably noticed from roughly 0.5 - 1 dB; a narrow-band (Q ~1) change needs about 1 - 1.5 dB; loudness differences are noticed from ~0.5 LU when paired and are clearly "louder" at ~1 LU; stereo width change is noticed from ~1 dB side/mid; envelope (attack) change is noticed from roughly 1 - 1.5 dB attack/sustain contrast.

### 3.1 K1 loudness

- Musical meaning: the master plays back louder or quieter at the same listening gain. A client saying "louder" wants a clearly higher integrated level; "softer" wants a quieter, gentler master.
- DSP means: shift the integrated-LUFS target by `1.25 LU * v` (current tweak_summary); raise level by gain into the limiter (more limiter drive), allow ceiling-limited soft clip/clipper stage; for softer, lower the target and back off compression. Fix: the achievable-by-budget clamp may reduce but never invert; tags louder/softer must resolve to this control and not carry their own target deltas.
- Measure: `integrated LUFS(TEST) - integrated LUFS(DEFAULT)`, un-matched. Secondary: `short_term_crest_change_db` and `limiter_gr_p995_db` from regression `measure()`.
- Direction and minimum (design target): v=+1 -> >= +0.75 LU (nominal +1.25); v=-1 -> <= -0.75 LU. v=0.5 -> 30-80 percent of that.
- Bounds: delivered LUFS within `loudness_tolerance_lu` of the REQUESTED target; true peak <= ceiling; `limiter_gr_p995_db` increase <= 2.5 dB vs default; `transient_retention` >= 0.88 and pumping > -1.0 dB (hard guardrails); crest may fall by up to 1.5 dB.
- Planned allowance: the loudness shift is a plan decision (`user_shift_lu`); the loudness-target check uses the shifted target. No band/tilt allowance needed.
- Interactions: priority Musicality > Transients > Tonal balance > Dynamics > Loudness. If reaching the requested level would break a transient, tonal or pumping guardrail, loudness yields, and the job reports `partial` with requested vs achieved LU and the limiting guardrail (explicit loudness requests keep this contract and are always reported, never silently reduced). Louder must never produce a quieter master than default; if the clamp leaves nothing, report `not_honoured`.

### 3.2 K2 era_density (style: modern / open / dense / vintage)

- Musical meaning: how compressed and dense the master feels. Open = natural dynamics, more peaks; dense = steady, thick, competitive; vintage = lower density, softer top, tape-like colour.
- DSP means: compression aggression and multiband ratios, limiter drive, clipper/saturation amount, dynamic-range target; vintage adds soft saturation and a gentle HF cap. Loudness is NOT the lever here (that is K1); level differences should be small and in the musically coherent direction.
- Measure: loudness-matched `short_term_crest_change_db` (TEST minus DEFAULT) and `lra_change_lu` from `measure()`; secondary `plr_db`. Vintage additionally N1 tilt and high-band delta.
- Direction and minimum (design target): open: crest >= +1.0 dB vs modern; dense: crest <= -1.0 dB; vintage: crest >= +1.0 dB AND high_6000_20000 <= -0.5 dB. Today: dynamic/natural-type styles give crest -0.73 (wrong sign for "open") because LUFS rose by 0.76 (AUDIO-011).
- Bounds: `|delta LUFS|` <= 0.5 LU between variants (so it is a density control, not a hidden loudness control); dense must keep `transient_retention` >= 0.88, pumping > -1.0, `added_distortion_db` within the existing budget; open must not leave final loudness more than 1.5 LU from target.
- Planned allowance: compression and saturation are plan stages, not EQ; none needed except vintage's HF cap, which must appear in `planned_band_deltas_db` (needs <= -2.0 dB total, inside the 3.5 absolute cap).
- Interactions: dense vs K3 punch +1: both can coexist only while `transient_retention` >= 0.88; punch wins (Transients above Dynamics), dense is reduced and reported. Open + K1 louder: open yields (Dynamics above Loudness is the priority order, but explicit K1 keeps its contract, so report that open and louder conflict and what was achieved).

### 3.3 K3 punch ("punchier drums")

- Musical meaning: kick and snare hit harder: faster, more pronounced attack relative to the sustain, with the kick body and snare crack present, without the track getting louder or the mix getting squashed.
- DSP means: transient shaping (attack gain via fast/slow envelope difference or upward/parallel processing) in a ~50-120 Hz kick band and a ~1.5-5 kHz snare/crack band; slower compressor attack and lower ratio on low/punch/low_mid bands; ease limiter drive (less limiting) to keep the peaks; a small (<= 1 dB) kick-body/crack band emphasis as support, not as the mechanism. A static EQ alone does not satisfy the contract.
- Measure (vs DEFAULT, loudness-matched): `compare()`: `punch_master / punch_default` (drum_punch_estimate ratio), plus N4 `attack_ratio`; `short_term_crest_change_db`; `transient_retention`.
- Direction and minimum (design target): v=+1 -> punch ratio >= 1.06 (+6 percent) AND N4 attack ratio >= +1.0 dB in the kick or snare band AND crest >= +0.3 dB; v=-1 -> punch ratio <= 0.94 and N4 <= -1.0 dB (softer, rounder). Today: 0.00 for the tweak, 0.36 dB static for the tag.
- Bounds: loudness-matched LUFS change <= 0.3 LU (not a loudness trick); kick/snare emphasis band move <= 1.5 dB; `punch_loss` vs SOURCE <= 0.12 for v>=0 (hard guardrail); pumping > -1.0 dB; true peak <= ceiling; limiter GR must not increase.
- Planned allowance: the support emphasis (kick body, crack) must be listed in `planned_band_deltas_db` (<= 1.5 dB per band). For v<0 the transient softening is a planned loss: it must be declared and the `max_transient_loss` check evaluated against 0.12 of source punch still holds (so v=-1 may be limited, reported `partial`, on sources already at the limit).
- Interactions: punch vs K1 louder: punch wins (Transients above Loudness); loudness is reduced and reported if retention would drop below 0.88. Punch vs K2 dense: see 3.2. Punch vs K4 low_end +1: kick body boost must not exceed the low-band bound in 3.4 combined.

### 3.4 K4 low_end ("deeper bass" / "tighter bass")

- Musical meaning: more (or less) sub and bass weight; kick and bass sound bigger, or cleaner and tighter.
- DSP means: low shelf/bell around 50-120 Hz, optionally dynamic (gain follows a low-band compressor so it does not pump), bass-band multiband gain, mono-below-120 Hz guard, sub-low-cut protection. Fix: the shelf must survive downstream normalisation (today it is cancelled, low band -0.02).
- Measure (vs DEFAULT, loudness-matched): mean of `band_deltas_db` over the three `LOW_END_MUSICAL_BANDS` (sub_bass_35_60hz, kick_bass_60_120hz, upper_bass_120_250hz), via `compare()`.
- Direction and minimum (design target): v=+1 -> mean low delta >= +1.0 dB (target +1.2 to +1.5); v=-1 -> <= -1.0 dB. Today: +1 gives -0.02; -1 gives -0.85.
- Bounds: any single band move <= 3.0 dB (inside `max_any_band_change_db` 4.0); mid/high bands off-axis <= 0.5 dB; `mono_fold_loss_change_db` <= 1.0 dB; true peak and `limiter_gr_p995_db` increase <= 1.5 dB; `transient_retention` >= 0.88 (a big low boost eats headroom and softens kicks); for v<0 the cut must stay within `absolute_max_low_end_loss_db` 4.5 and, since it is requested, is allowed up to 2.0 dB total under the unplanned rule only if declared planned.
- Planned allowance: both boost and cut must be in `planned_band_deltas_db` so `max_low_end_loss_db` (2.0, unplanned basis) does not veto a user-requested cut. The total-loss absolute cap 4.5 stays.
- Interactions: low_end +1 vs K1 louder: headroom is finite; low boost lowers achievable loudness, bass chip honoured (Tonal balance above Loudness), loudness reduced and reported. low_end vs K3: see 3.3.

### 3.5 K5 warmth ("warmer")

- Musical meaning: fuller body, softer and rounder top, a touch of harmonic density (analog feel). Not "more bass" and not "duller" outright.
- DSP means: broad bell at 200-400 Hz, small high-shelf trim above ~8 kHz, low-order (even) harmonic saturation on low-mid/mid; tape-like. Saturation amount from the existing `saturation_delta`.
- Measure: N1 tilt (TEST minus DEFAULT) and band deltas for 250-500 Hz and 6-20 kHz via `compare()`; `added_distortion_db` for the saturation.
- Direction and minimum (design target): v=+1 -> tilt <= -0.12 dB/oct AND low_mid (250-500 Hz) >= +0.8 dB AND high_6000_20000 <= -0.5 dB; v=-1 -> tilt >= +0.12 dB/oct. Today: max band 0.40 dB with the high band -0.17.
- Bounds: low_mid boost <= 2.0 dB; high cut <= 2.5 dB; `unplanned_low_end_min_db` unchanged; `added_distortion_db` within the existing distortion budget; kick_bass_60_120 off-axis <= 0.5 dB (must not become boomy); `transient_retention` >= 0.88.
- Planned allowance: tilt drift guardrail is 0.3 dB/oct for UNPLANNED drift; a user-requested tilt of 0.12 - 0.3 dB/oct must be planned (in the plan's EQ-only prediction) to avoid a false veto; total tilt capped at 0.5 dB/oct.
- Interactions: warm vs bright: opposite tilt; if both are set, the net tilt is their sum and both must be reported (cancelled requests are `partial`). Warm vs K8 clarity: both touch 250-500 Hz in opposite directions; the net is the sum, clarity wins on the mud index only if explicitly selected (report conflict).

### 3.6 K6 brightness ("brighter")

- Musical meaning: more air and sparkle, hats and cymbals and vocal breath more open, without harshness or sibilance.
- DSP means: high shelf from 8 - 10 kHz, optional dynamic/de-essed shelf so sibilant peaks do not jump, optional excite/parallel HF saturation, limiter-aware (HF boost raises peaks).
- Measure: `band_deltas_db` of high_6000_20000 and presence_4000_6000hz via `compare()` (the `high_change_db` field), N1 tilt, N5 sibilance.
- Direction and minimum (design target): v=+1 -> high_6000_20000 >= +1.0 dB AND tilt >= +0.12 dB/oct; v=-1 -> high_6000_20000 <= -1.0 dB. Today: +/-0.48 (about half the design target).
- Bounds: `high_change_db` <= 2.5 dB (matches `max_high_boost_db`); N5 sibilance delta <= +1.5 dB; presence_4000_6000 <= +1.5 dB; `pumping_db` > -1.0; hard cap `absolute_max_high_boost_db` 3.5.
- Planned allowance: the shelf must be in the plan's EQ-only prediction; the unplanned HF check stays at the default 2.5 dB; do not relax it. If the source is already excessive in highs (diagnosed `excess` bands), the move is bounded and reported (existing note logic in apply_user_tweaks_to_plan).
- Interactions: bright vs warm: see 3.5. Bright vs K7 presence: independent bands (3 kHz vs 8 kHz+), but their sum in 4-6 kHz is bounded at 1.5 dB combined.

### 3.7 K7 presence ("better vocals")

- Musical meaning: the lead vocal sits forward and is easier to understand, without being shrill or sibilant.
- DSP means: bell at ~2.5-4 kHz (Q ~0.9), small 1-2 kHz forward-mid lift, vocal-aware via stem/vocal-relationship measurement (`measure_vocal_relationship`) when available, de-esser on the 5-9 kHz band (the tag already sets `deesser_strength` 0.5); do not raise the whole mix top.
- Measure: `band_deltas_db` for high_mid_2000_4000 (and the mid-band covering 1-2 kHz) via `compare()`; N5 sibilance; if a vocal stem is available, vocal-to-accompaniment level ratio change from `measure_vocal_relationship` (proposed secondary).
- Direction and minimum (design target): v=+1 -> 2-4 kHz band >= +1.0 dB AND sibilance delta <= +0.5 dB; with a stem, vocal/accompaniment ratio >= +0.5 dB. v=-1 -> 2-4 kHz <= -1.0 dB (pulls the vocal back). Today: tag 0.00 (identical to no-op), slider +/-0.48 / 0.50.
- Bounds: 2-4 kHz boost <= 2.0 dB; `high_change_db` <= 2.5 (presence_4000_6000); sibilance <= +1.5 dB hard; no low-end change > 0.3 dB.
- Planned allowance: bell declared in plan; the high-band guardrail applies to presence_4000_6000hz so the bell must be centred and shaped to keep leakage into 4-6 kHz <= 1.0 dB.
- Interactions: with K6 and K8 see 3.6 and 3.8. Instrumental material (no vocal detected): the control still works as a 2-4 kHz emphasis, but status is reported `partial: no vocal detected`.

### 3.8 K8 clarity ("clearer")

- Musical meaning: less mud and boxiness, more definition; instruments separate better.
- DSP means: cut of 1 - 2 dB around 250 - 500 Hz (dynamic, driven by the mud-band level), small upper-mid assist (<= 1 dB at 3-5 kHz).
- Measure: N3 mud_index (TEST minus DEFAULT, loudness-matched); bands via `compare()`.
- Direction and minimum (design target): chip on -> mud_index <= -1.5 dB AND kick_bass_60_120 >= -0.3 dB. Today: low_mid move is tiny (max band 0.37).
- Bounds: 250-500 cut <= 2.5 dB; 4-6 kHz rise <= 1.0 dB (`max_high_boost_db` stays); sub/bass not reduced by > 0.5 dB (`weaker_bass` guard).
- Planned allowance: cut declared in plan. No tilt allowance beyond 0.2 dB/oct.
- Interactions: opposes K5 warm in 250-500 Hz (3.5).

### 3.9 K9 width

- Musical meaning: a wider, more enveloping stereo image, while mono compatibility and a centred low end are kept.
- DSP means: mid/side processing: side gain above ~150 Hz (bass stays mono), optionally stereo enhancement on mid-high only; multi-band width, correlation guard.
- Measure: N2 `side_mid_delta_db` full-band, and below 120 Hz; `stereo_correlation` and `mono_fold_loss_change_db` from `measure()` / `measure_files()`.
- Direction and minimum (design target): v=+1 -> N2 >= +1.0 dB (currently +0.69 for slider, 0.00 for the tag); v=-1 -> N2 <= -1.0 dB. Below 120 Hz N2 change <= 0.3 dB in both directions.
- Bounds: `mono_fold_loss_change_db` <= 1.5 dB worse than default; `stereo_correlation` stays >= 0.0 and does not fall by more than 0.15 vs default; L/R balance unchanged (channel-imbalance check); no band move > 0.5 dB.
- Planned allowance: `plan.stereo.user_side_gain_db` already planned. None needed for bands.
- Interactions: wide vs K4 low_end: keep bass mono. Wide + `dynamic`-style defaults: the style's width delta is part of K2 and must not undo K9.
- Cannot honour: mono or near-mono input (correlation > 0.98), one-dead-channel input: report `not_honoured: source is mono`.

### 3.10 K10 delivery

- Musical meaning: where the master is going. Streaming (Spotify/YouTube/Tidal/Amazon, -14 LUFS), Apple Music (-16 LUFS), Loud (club/DJ, +1 LU over genre best practice), Auto (genre default).
- DSP means: set the loudness anchor and true-peak ceiling (-1 dBTP; -2 dBTP above -14 LUFS per the existing rule); lower density only because the target is lower.
- Measure: integrated LUFS of the render (un-matched) vs the delivery reference; true peak; Apple minus streaming difference; loud minus auto difference.
- Direction and minimum (design target): streaming within +/-0.5 LU of -14.0; apple within +/-0.5 LU of -16.0 (apple - streaming = -2.0 +/- 0.5); loud - auto >= +0.75 LU. Today: streaming -3.88 LU and apple -5.88 LU vs baseline (consistent with the references on this loud source); loud +0.39 (below the intended +1.0).
- Bounds: true peak <= -1.0 dBTP (-2.0 for > -14 LUFS content), existing tolerance 1.5 LU kept as the hard guardrail; the 0.5 LU target is the contract and any miss is reported.
- Planned allowance: loudness-target check uses the delivery-adjusted target. No band allowance.
- Interactions: K1 offsets from the delivery anchor; if K1 pushes a streaming/apple master above its reference, report "platform will turn this down by X dB" (still honoured). Delivery decides the anchor, not the dimension priority list.

### 3.11 Tier professional (not a chip; recorded for completeness)

`tier:professional` produced a byte-identical render on pop-before (VERIFIED). Contract: Professional must be better or equal to Standard on guardrail margins and never worse on the loudness-matched metrics in compare(); if the two renders are identical the UI must not claim a difference. Needs its own mastering-engineer verdict with synthetic `*_pro` fixtures; out of scope here.

## 4. Test matrix

Fixtures: synthetic (`backend/benchmark/synthetic_corpus.py`) plus two real tracks: `pop-before.mp3` (project-owned, committed) and "Dune Slinger" (git-ignored, local-only: run locally, never commit audio or derived waveforms; commit only the numeric result JSON). "Y" = contract must pass (or report an allowed status). "R" = honoured only up to the stated limit and must emit a non-silent `partial`/`not_honoured`. "-" = not applicable.

| Fixture | K1 loud | K2 style | K3 punch | K4 low_end | K5 warm | K6 bright | K7 presence | K8 clarity | K9 width | K10 delivery |
|---|---|---|---|---|---|---|---|---|---|---|
| healthy_pop | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| healthy_master_pop (-10.5 LUFS, limited) | R (little headroom) | Y | R | Y | Y | Y | Y | Y | Y | Y |
| bass_heavy_hiphop | Y | Y | Y | +1: R (bounded), -1: Y | Y | Y | Y | Y | Y | Y |
| boomy_extreme_trap | Y | Y | Y | +1: R, -1: Y | Y | Y | Y | Y | Y | Y |
| thin_edm | Y | Y | Y | +1: Y, -1: R (bounded by 4.5 dB cap) | Y | Y | Y | Y | Y | Y |
| dark_rock | Y | Y | Y | Y | -1 tilt: R | +1: Y | Y | Y | Y | Y |
| bright_harsh_pop | Y | Y | Y | Y | Y | +1: R (excess highs, bounded) | +1: R (sibilance) | Y | Y | Y |
| rock_transient | Y | Y | Y (richest punch test) | Y | Y | Y | Y | Y | Y | Y |
| already_limited_edm | +1: R, -1: Y | dense: R | +1: R (no headroom) | Y | Y | Y | Y | Y | Y | Y |
| dense_drums_edm | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| quiet_dynamic_jazz | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| wide_low_techno | Y | Y | Y | Y | Y | Y | Y | Y | +1: R (already wide, correlation floor) | Y |
| regression_mix_pop | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| mono_acoustic | Y | Y | Y | Y | Y | Y | Y | Y | not_honoured (mono) | Y |
| one_dead_channel_rnb | Y | Y | Y | Y | Y | Y | Y | Y | not_honoured | Y |
| clipped_metal | R (already clipped) | R | R (transients flattened) | Y | Y | R | Y | Y | Y | Y |
| short_3s_pop | Y (LUFS gating caveat) | - | Y | Y | Y | Y | Y | Y | Y | Y |
| pop-before (real) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Dune Slinger (real, local) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |

Per-contract test steps (each automated in the QA harness once implemented):
1. Effect: v=+1 and v=-1 against DEFAULT, assert direction and the min effect of section 3 on the measure named there.
2. Monotonic: v=+/-0.5 within 30-80 percent of v=+/-1.
3. Orthogonality and bounds: assert the bounds of the contract and the guardrails (no `compare()` failures: lost_drums, weaker_bass, harsh_highs, pumping; `output_validation` passes with the planned-move allowances declared).
4. Aliases: every merged tag/category/flavour/style resolves to its kept vector; assert its render equals the kept-control render within 0.2 dB / 0.2 LU, and that no two distinct UI chips produce byte-identical audio (CHIP_EFFECTS dedup rule). The 8 legacy tags and all 16 style names stay accepted by the API.
5. Report: when a bound stops the move short of the minimum effect, the job report contains `chip_report` with status and reason; the UI must show it.
6. Re-run `CHIP_EFFECTS` on pop-before after the fix; no remaining class "none"; the loudness chips must be in the right direction.

"Cannot honour safely" (must be reported, never silent). A control is `partial` or `not_honoured` when any of these holds:
- the move would breach a hard guardrail (transient_retention < 0.88, pumping <= -1.0 dB, true peak over ceiling, absolute low/high caps, mono fold loss > bound, correlation floor);
- the source already sits at the bound (limited master with no loudness headroom, clipped source, mono input for width, no drums detected for punch: `drum_punch_estimate` below `MIN_PUNCH_TO_JUDGE` 0.15, no vocal detected for presence);
- two controls requested in opposition cancel each other (warm + bright, warm + clarity, louder + punch with insufficient headroom): the report names both, the achieved net, and which won by priority.
The status carries requested value, achieved measure, and reason text. A render that fails silently (identical audio with no report) is a contract failure.

## 5. Open items and caveats

- All magnitudes are design targets (HYPOTHESIS) from JND reasoning, not listening results. HUMAN-VERIFIED status: PENDING. A blind, loudness-matched session over healthy_pop, rock_transient, pop-before, and Dune Slinger at v=+1 vs default for K3-K9 is needed before the minima are frozen; `blind_ab.py` can prepare it once the DSP changes land.
- CHIP_EFFECTS covers one real track; the section 4 matrix is the plan to extend it.
- Band names in contracts use those in `output_validation`/`band_levels`; the 250-500 Hz and 2-4 kHz band names come from params.py (`low_mid_250_500hz`, `high_mid_2000_4000hz`) and should be confirmed against `band_levels.py` by the implementer.
- UI chip wording and the exact alias strengths (e.g. warm analog 0.4) are mastering suggestions, to be confirmed by product-specialist; they do not change the contracts.
- I did not read the frontend; the reduced chip list is derived from the API-facing lists in params.py.
- Findings for audio-dsp-engineer: AUDIO-011 and AUDIO-012 remain OPEN; this document is their acceptance specification. No DSP code was edited.
