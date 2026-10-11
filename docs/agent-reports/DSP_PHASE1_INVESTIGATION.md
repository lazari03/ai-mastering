## Phase 1 — mastering quality investigation (2026-10-11)

Agent: audio-dsp-engineer · Mode: **investigation only, no tracked file changed** · Branch `claude/dsp-quality`.
Started at HEAD `7ffcc09`; HEAD moved to `85c2450` during the task (QA's real-audio gate). That commit touched no file under
`backend/ai_mastering/` or `params.py`, and `kb.py codehash` = `a5d9b116b8ee3056` throughout.
Python 3.12 venv. Scratch scripts are in `/tmp/claude-0/.../scratchpad/dsp2/`:
`render.py` (master_track), `measure.py` (loudness-matched metrics), `punch.py` (stage attribution), `bus_exp.py` (ceiling/clipper variants),
`dyneq.py`, `eqsplit.py`, `c09.py`, `plans.py` (plans for all 21 synthetic tracks).
Run them with `NUMBA_CACHE_DIR=<fresh dir>`: concurrent runs that share librosa's numba cache segfault in `beat_track` (reproduced twice; not a DSP defect).
Listening status: **PENDING for everything below.** All figures are objective measurements.

Real audio used:
* `frontend/public/audio/demos/pop-before.mp3`, decoded to float WAV, sha256_16 `04b8478e4fd60dbc`, 33.7 s, genre pop.
* **Dune Slinger "What Did I Say"**, which the product owner supplied mid-task: `backend/benchmark/corpus/dune_slinger_what_did_i_say/mix.wav`
  (git-ignored, internal-test licence), sha256_16 `61b79c654c325689`, 159.4 s, decoded from a 112 kbps MP3. Rendered as rock (meta placeholder) and as pop.
* `pop-after.mp3` (sha `33d06270a68eab02`) is **not a human master**. `frontend/src/content/demoMaster.js` records it as this engine's own output at commit
  `de1a473` (2026-09-28). The comparison below is therefore "current engine vs the engine from 2 weeks ago", not against a mastering engineer.

---

### 1. Pipeline: which stages run, and does the engine skip them when they are not needed?

Order (`processing/render.py:101-258`): static EQ → dynamic EQ → multiband compression → glue → de-esser → saturation → stereo → bus
(gain → optional soft clipper → 1 ms-lookahead true-peak limiter → loudness recovery → loudness guard → 16× TP trim).
A disabled stage does not touch the signal. Candidate loop: `mastering.py:441-455`.

| Stage | Gate (code) | pop-before | Dune (rock / pop) | Synthetic 21 tracks (`plans.py`) |
|---|---|---|---|---|
| Static EQ | confidence gates + caps, `plan.py:287-338` (calibration **balanced** is the default, `config.py:417`) | 5 bells: 35 Hz +1.67, 98 Hz +1.66, 309 Hz +1.66, 4.1 kHz −0.23, 11.2 kHz −1.05 | 2 bells, about 42/189 Hz +1.8 dB (pop: 39/152 Hz +1.81) | healthy fixtures: 0 moves (already audited) |
| Dynamic EQ | `plan.py:341-403` (segments hot 8-60 %, p90 > 1 dB above window) | 1092 Hz Q1, max 1.53 dB, mean 0.21 | 4708 Hz Q1, max 2.66 dB, mean 0.31 | **0 / 21** (never exercised by the synthetic gate) |
| Multiband / glue | micro need ≥ 0.2 / macro ≥ 0.25, `plan.py:426-467`, `budgets.py:85-120` | off | off | on only for dense_drums_edm(_pro) |
| De-esser | sibilance evidence | off | off | off |
| Saturation | `allowance × factors ≥ 0.03`, `plan.py:482-501` | off (HF factor 0.27) | **on** (drive 0.46 / 0.84 dB) | **on for 8 / 21** |
| Stereo | problem-gated, `plan.py:504-531` | off | off | off |
| Clipper | needs GR > budget + 0.3 and low transient risk, `plan.py:584` | off | off | thin_edm, wide_low_techno |
| Limiter | always | max GR 5.17 dB | 1.70 / 3.08 dB | up to 5.70 dB |

Verdict: the stage gating works as designed. Compression, de-esser, stereo and clipper stay off when not needed. Two stages run on real audio without
a measured *problem* behind them: **saturation**, which is a genre-default colour (D2), and possibly **dynamic EQ** (H1, needs listening). Neither is
exercised by the synthetic gate in the configuration seen on real audio.

---

### A) Confirmed defects

#### D1 — AURALITH-AUDIO-001 confirmed: both transient checks compare an absolute score delta, and the punch loss itself comes from the bus limiter (plus saturation)
**Units.** `output_validation.py:65` documents `max_transient_loss = 0.12` as a *fraction*. `mastering.py:236` passes
`evaluation.transients["delta"]`, which is `mst_score - src_score` in absolute score units (`evaluate.py:188`). The evaluator's own check has the same
problem: `allowed_loss = 0.22 - 0.15*priority` is compared with the absolute delta (`evaluate.py:187-189`). The benchmark (`benchmark/metrics.py:compare`)
uses the *relative* loss, so the engine and the benchmark disagree.
Measured: c03 punch 0.4698 → 0.3729, i.e. **20.6 % relative, abs 0.097**. It passes both engine checks (0.12 and edm 0.1225).
Synthetic baseline rows that would flip under relative units: guardrail 12 % → short_3s_pop (15.6 %) and one_dead_channel_rnb (12.9 %);
evaluator → those two plus dark_rock (9.0 % vs rock 8.2 %). The other 18 rows are unaffected.

**Root cause of the punch loss.** Stage attribution (`punch.py`: same plan rendered with one stage removed, and the bus alone at stepped targets.
Punch is level-invariant, since gain alone gives exactly the source score):

| Case | Full plan loss | Bus only (gain + limiter) at the same target | Bus at −1 / −2 / −3 LU | Without saturation | Without EQ | Compression |
|---|---|---|---|---|---|---|
| c01 pop | 10.7 % (lim GR 5.08) | **10.7 %** (identical) | 6.4 / 3.4 / 1.8 % | n/a (off) | same | off |
| c03 edm | 20.6 % (lim 3.31 + clip 0.33, sat 1.09 dB) | 18.2 % (lim 5.50) | 15.7 / 7.6 / 4.9 % | 16.0 % (−0.62 LU) | 16.1 % | off |
| c07 rock | 2.9 % (lim 4.37) | 2.9 % | 1.4 / 0.6 / 0.0 % | off | same | off |
| pop-before | 3.4 % (lim 5.17) | **8.8 %** (EQ + dyn-EQ mask part of it in the metric) | 2.3 / −0.1 / 0.2 % | off | 8.8 % | off |
| Dune rock | **7.3 %** (lim 1.70) | 3.7 % (lim 3.83) | 1.6 / 0.5 / 0.1 % | **−0.1 %** (lim 3.90, −0.09 LU) | 8.8 % | off |
| Dune pop | 10.4 % (lim 3.08) | 11.1 % (lim 5.54) | 5.0 / 2.9 / 1.1 % | 9.8 % (lim 5.54) | 11.4 % | off |

* The **true-peak limiter's gain reduction is the primary cause** on every case (`bus_processing.py:154-214`, driven by the limiter damage budget
  `budgets.py:63`, up to 6 dB at p99.5, and the loudest-peak cap 6 − 0.3 = 5.7 dB, `render.py:225`). Loss grows steeply over the last 1-2 dB of gain
  reduction (c01: 0.3 % at 0.08 dB p99.5 GR, 10.7 % at 4.05 dB).
* **Saturation is the second cause.** On Dune rock it is responsible for essentially all the loss (D2).
* **Glue and multiband compression are not the cause.** They are off in every measured case.
* Lookahead is not under-sized. Longer lookahead *increases* loss (c01: 1 ms 10.7 %, 3 ms 13.6 %, 5 ms 15.1 %; pop-before 8.8 → 15.5 → 19.6 %).
  Release 200 ms instead of the plan's ~130-165 ms changes nothing (±0.1 pt).

Severity **P2**.

#### D2 — NEW: saturation is enabled as a genre-default colour without a measured need, and because it is referenced to the source's p99.5 peaks it acts as a transient shaver
`plan.py:482-501`: `amount = context.saturation_allowance × ∏factors`. The allowance comes from `GENRE_TARGET_PROFILES[genre]["base_saturation"]`
plus style, category and tags (`target_model.py:313-316`). No diagnosed problem is needed. The "identity" factor `0.3 + 0.7*change_budget`
(`plan.py:493`) *raises* colour when the EQ need is large, which is unrelated. The renderer drives tanh relative to the 99.5th-percentile 10 ms peak
(`render.py:175`, `_saturate` `render.py:87-98`), so the drive lands exactly on the loud hits.
* **Dune rock** (drive 0.46 dB): punch loss **7.3 % with saturation vs −0.1 % without**, at −11.53 vs −11.62 LUFS. It is the only stage that costs punch on
  this track. The limiter then takes 3.9 dB instead of 1.7, which is still inside its 4.41 dB budget. Distortion worst-band −23.42 dB, blamed on saturation.
* Dune pop (drive 0.84): 10.4 % vs 9.8 %. Distortion −22.33 dB (4-16 kHz), blamed on saturation. That is the closest of any real track to the −18 dB line.
* c03 (drive 1.09): 20.6 % vs 16.0 %. It also buys +0.62 LU, because the limiter cap binds without it.
* It is enabled on 8 of 21 synthetic tracks (bass_heavy_hiphop(_pro), boomy_extreme_trap, dense_drums_edm(_pro), regression_mix_pop, thin_edm, wide_low_techno).
* The mix note shown to the Dune user says "compression and limiting were kept gentle so they don't soften [transients] further", while saturation softens them.

Severity **P2** (minimum-processing principle, transient priority).

#### D3 — NEW, and the real part of AURALITH-AUDIO-005: the true-peak ceiling comes from the genre's loudness *window*, not the loudness actually delivered, so quiet masters are limited 1 dB harder than delivery requires
`target_model.py:369`: `ceiling = −2 if acceptable_max_lufs > −14 else −1`. For rock/pop/edm the window maximum is above −14, so the ceiling is −2 dBTP
even when the master lands well below −14 LUFS. The −2 dBTP rule (Spotify) applies only to masters louder than −14 LUFS.
Affected: c07/f01 (−17.3 LUFS), synthetic rock_transient(_pro) (−16.0), dense_drums_edm(_pro) (−15.7). All are delivered at −2.0 dBTP.
Same target with −1 dBTP (`bus_exp.py`, variant B):

| Case | LUFS | Limiter max GR | p99.5 GR | Punch loss | Added distortion | Pumping |
|---|---|---|---|---|---|---|
| c07 now (−2 dBTP) | −17.29 | 4.37 | 3.06 | 2.9 % | −27.9 dB | −0.02 |
| c07 at −1 dBTP | −17.19 | **3.37** | 2.05 | **1.4 %** | **−30.1 dB** | −0.00 |

(For comparison only, masters louder than −14 must keep −2 dBTP. At −1 dBTP, c01 would drop to 6.4 % from 10.7 %, and pop-before would show pumping −0.10
instead of −0.42 and lower GR. That shows how much each dB of ceiling costs, but it is **not** a proposal for those masters.)
The rest of AUDIO-005 is **not a defect**: −1.0 on c06/c08/c10 follows the rule (window ≤ −14), −3.55 on c12 means the target was reached without limiting,
and the c11 message prints the ceiling actually used for c11 (−2). Severity **P2** (quality at no cost), P3 for the message.

#### D4 — AURALITH-AUDIO-002 confirmed, with root cause: no polarity check at input; the stereo planner then destroys the inverted channel, and output QC can never pass
c09 (`c09.py`): input correlation −0.906, mono sum 13.3 dB below stereo. `validate_input_signal` (`quality_control.py:45-114`) checks DC, silence and
silent channels but not polarity. The planner reads correlation −0.91 as `excessive_width` plus `excessive_low_frequency_stereo` and plans LF-mono at
160 Hz plus −3 dB side gain (`plan.py:508-520`). In an L = −R mix the "side" is the music, so this removes the content. The output QC fail line,
correlation < −0.5 (`quality_control.py:256`), cannot be met because no stage flips polarity. Result: `InvalidAudioError` after rendering
(5.1 s on a 10 s clip; candidate loop bounded by `MAX_CANDIDATE_RENDERS = 4`), listing 5 unrelated-sounding failures. On a full song the user waits
minutes for an unhelpful refusal. Severity **P2**.

#### D5 — AURALITH-AUDIO-006 mechanism confirmed (but genre is not ignored): the loudness target is capped by the source's peak-to-loudness ratio × the transient budget
`plan.py:547-549`: `target = min(desired, LUFS + ceiling + budget − p99.5)`, with `budget = 6 − 3.5 × transient_health × genre_transient_priority`
(`budgets.py:63`). Rock's preferred loudness is −11.5 (genre −10.5 + modern −1.0). c07 is capped at −17.07 because its p99.5 peaks sit high
(crest 20.5 dB) and the rock transient priority (0.92) shrinks its budget to 3.04 dB. f05 (−14.9) has a smaller crest. On real Dune the cap does not
bind: rock lands at −11.53 against −11.5 requested. So the target follows crest **only when the cap binds**, which is quality-first by design. The real
waste on c07 is D3 (1 dB of GR spent on a ceiling not needed). Severity **P3** (product decision on whether −17 LUFS rock is acceptable).

#### D6 — NEW: loudness is never traded for quality unless a hard check fails
`mastering.py:455` delivers the *first* passing candidate, and corrective candidates exist only after a failure (`evaluation/backoff.py`, relief ladder
clipper → limiter → compression → saturation → loudness). There is a bounded candidate system (`MAX_CANDIDATE_RENDERS = 4`), but it does **not** choose
on quality: it never accepts a quieter master to keep punch while the louder one passes the (loose, D1) checks. Inside the bus, loudness recovery stops
only on crest floor, diminishing returns or limiter caps (`bus_processing.py:82-151`).
Real evidence, pop-before: delivered −10.12 LUFS with **5.17 dB** max limiter GR (QC warns at 3, fails at 6), PLR 12.98 → 8.12. Bus-only punch loss is
8.8 % at −10.1, 2.3 % at −11.2 and −0.1 % at −12.1 LUFS, all inside the pop acceptable window (−13.78 … −9.0). An engineer working "loudness last"
would stop about 1 LU earlier. Severity **P2** (design gap against the stated priority order; the threshold needs listening).

#### D7 — NEW (minor): the planner boosts below 40 Hz when only the 20-30 Hz band is deficient
pop-before: `insufficient_sub` on band `20_30hz` only (sev 1.0, conf 0.67) → bell 35 Hz +1.67 dB Q2.5 (`plan.py:136-165`; low shelves are allowed for
*excess* only, `plan.py:155`). A 20-30 Hz deficit is usually an intentional high-pass, and this band is excluded from judgement elsewhere
(`evaluate.py`, `< 25 Hz` unreliable). Measured harm is negligible (punch loss 3.4 % with it vs 3.9 % without; subsonic +0.57 dB), so this is an
**unnecessary move**, not damage. It fires on 0 / 21 synthetic tracks. Severity **P3**.

#### D8 — Test-coverage gap (confirmed): behaviour seen only on real audio is not covered by the synthetic gate
Dynamic EQ (0 / 21), the sub-40 Hz boost (0 / 21), and saturation on a real arrangement. QA's new `--real` gate (`85c2450`, `baselines/real.json`) now
pins Dune rock and pop-demo, and my numbers reproduce it (Dune rock −11.53 LUFS, retention 0.927, lim GR 1.70; pop −10.12). Any fix to D2, D3 or D7 moves
that baseline too. Severity P3.

#### D9 — Stale knowledge (info)
`DSP_KNOWLEDGE.md` lists planner caps "max cut 3 dB / boost low 1.5 / mid 1.0 / high 1.0, HF budget 1 dB". Those are the *conservative* values. The
default is **balanced** (`config.py:417`: cut 4 dB, boost 2.5/2.0/2.0, HF budget 2.0, cut fraction 0.7, boost fraction 0.6). Also, the homepage demo is
stale: `demoMaster.js` states −11.26 LUFS (engine `de1a473`), while the current engine delivers −10.12 (frontend-owned; re-run
`scripts/render_homepage_demo.py` after Phase 2).

---

### B) Rejected or unconfirmed hypotheses

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| R1 | "The engine reduces bass" (customer claim, on real tracks) | **Rejected** | Loudness-matched: pop-before sub +0.44 / kick +0.87 / upper bass +0.99 dB; Dune rock +1.25 / +1.18 / +1.47; 20-120 Hz energy share +0.22 dB (pop) and +0.83 dB (Dune rock). The engine *adds* bass on both. Synthetic: only the deliberately boomy fixtures are cut. |
| R2 | Unnecessary HF shelving or 2-5 kHz boosts | **Rejected** | No automatic HF or presence boost on any real or QA case. Real tracks get HF *cuts* (pop −0.65 / −0.86 dB, 4-6k / 6k+; Dune −1.2 dB at 2-6 kHz). HF boosts are gated (boost_high 0.50) and blocked on bright sources; Dune `insufficient_air` was rejected at conf 0.04 (codec-limited MP3, correct). |
| R3 | Glue or multiband compression causes the punch loss | **Rejected** | Compression is off on c01/c03/c07/pop/Dune, and removing it changes nothing (table D1). Only dense_drums_edm compresses (micro need gate 0.2). Already-limited detection works: c05 effectively bypassed (Δ ≤ 0.14 dB). |
| R4 | A longer lookahead or slower release would keep punch | **Rejected** | 3-5 ms lookahead raises loss (c01 10.7 → 13.6 / 15.1 %; pop 8.8 → 15.5 / 19.6 %). 200 ms release: ±0.1 pt. |
| R5 | A clipper before the limiter buys loudness without punch cost | **Rejected** | At the same target the clipper changes loss by about ±1 pt (c07 2.9 → 2.3-2.7 %; c01 10.7 → 10.0-11.8 %; pop 3.4 → 2.3-4.4 %). Spending the clip share on loudness always costs more (c01 +1 LU: 15.7 %; pop-before +1.5 LU: 8.4 % and pumping −0.89). |
| R6 | AUDIO-005 is an inconsistency bug | **Mostly rejected** | Rule-based (D3 explains it). −3.55 = no limiting needed; the c11 text matches its −2 ceiling. The remaining defect is D3. |
| R7 | Dynamic EQ is a broadband level ducker | **Rejected** | Gain reduction correlates with spectral hotness (band minus broadband: r = 0.64 pop, 0.60 Dune) more than with level (r = 0.38 / 0.34) (`dyneq.py`). |
| H1 | Dynamic EQ makes unnecessary moves on real mixes | **Insufficient evidence (listening needed)** | It fires on both real tracks and never on synthetic ones. On Dune it cuts a **1.6-octave** passband (2.35-7.06 kHz, Q1) by up to 2.66 dB on 41 % of 400 ms blocks, where static analysis scored harshness 0.00 and rejected `harsh_upper_mids` (conf 0.15). It accounts for about −0.6 dB of the −1.2 dB 2-6 kHz drop. On pop it acts on 546-1638 Hz (vocal core) up to 1.53 dB. Its effect is not in the guardrail's "planned" basis, so it counts as unplanned collateral. |
| R8 | The punch metric is a level-matching artifact | **Rejected** | Gain-only render gives exactly the source score (c01 0.5456 = 0.5456). It *is* affected by EQ (pop-before: static EQ alone 6.0 %, dyn-EQ alone 7.8 %, both 3.4 %, bus only 8.8 %), so limiter cost should be judged pre-bus vs post-bus. |
| R9 | c03 thin mix gets "low +0.46 dB only" | **Partly rejected** | 0.46 is kick at whole-mix-LUFS matching (the QA metric artifact, F3 from the discovery audit). Relative to mid: sub +1.05, kick +0.85, upper bass +1.36. Under-correction of a 7 dB deficit (~1.3 dB realised) is by design (balanced: 2.6 dB window absorbs first, ×0.6 boost fraction, 2.5 dB low cap, ×0.8 two-bell split → 1.94 dB bells). Bass boost also costs punch (c03 without EQ: 20.6 → 16.1 %). No change without listening. |
| R10 | Stereo or phase damage from processing | **Rejected** | Real tracks: correlation 0.626 → 0.646 (pop), 0.895 → 0.893 (Dune). Side/mid change ≤ 0.3 dB. Mono fold-down loss change ≤ 0.06 LU (pop 1.38 → 1.32; Dune 0.23 → 0.25). Stereo stage off. |
| R11 | Distortion added | **No defect, watch** | Real worst −22.33 dB (Dune pop, saturation) vs −18 line; pop-before −25.83. |
| R12 | Genre drives the tonal decisions (Dune) | **Rejected** | Rock vs pop: same problems (rock sub cluster one band wider, to 400 Hz), EQ gains within 0.02 dB (bells 42/189 vs 39/152 Hz), same dyn-EQ. Genre moves loudness (−11.53 vs −10.10), limiter GR (1.70 vs 3.08), saturation (0.46 vs 0.84 dB), punch loss (7.3 vs 10.4 %). |

---

### Item 7: real-audio results (loudness-matched, `measure.py`; band deltas are whole-LUFS matched / relative to 500-2k)

**pop-before** (genre pop, default settings). Delivered candidate `initial`, 1 render, no failures. Verdict warning: QC limiter GR 5.17 dB.
Output sha `b63fff9524e339d5`, 54 s render.

| Metric | Source | Engine now | pop-after (engine `de1a473`) |
|---|---|---|---|
| Integrated LUFS | −15.89 | **−10.12** (target −10.0) | −11.25 |
| True peak dBTP (16×) | −2.91 | −2.00 | −2.02 |
| Crest (peak/RMS) dB | 15.30 | **10.21** | 11.24 |
| PLR dB | 12.98 | 8.12 | 9.24 |
| LRA LU | 2.21 | 1.87 | 1.82 |
| Short-term crest dB | 12.52 | 10.69 | 11.37 |
| Correlation / side-mid dB | 0.626 / −6.38 | 0.646 / −6.67 | 0.639 / −6.57 |
| Mono fold-down loss LU | 1.38 | 1.32 | 1.35 |
| Punch retention (matched) | | 96.6 % (bus only: 91.2 %) | 96.6 % |
| Pumping (HF dip on kick) | | −0.42 dB | −0.47 dB |
| Limiter max / p99.5 GR | | 5.17 / 3.88 dB (budget 4.62) | 5.38 dB (demoMaster.js) |
| 20-120 Hz share | −3.30 dB | −3.08 | −3.15 |

Band deltas (engine): subsonic +0.57/+0.98 · sub +0.44/+0.85 · kick +0.87/+1.28 · upper bass +0.99/+1.40 · low-mid **+1.08/+1.50** · mid −0.41/0 ·
high-mid −0.48/−0.07 · presence −0.65/−0.23 · high −0.86/−0.45.
Why: `thin_body` (conf 0.93, 55-550 Hz) → two bells at 98 and 309 Hz; `excessive_brightness` (conf 0.72) → 11.2 kHz −1.05; dyn-EQ at 1.09 kHz.
Current vs `de1a473`: +1.13 LU louder, −1.04 dB crest, more low-mid lift (+0.77 dB). The low-mid lift (+1.5 dB relative to mid at 250-500 Hz) on a
"vocal-forward" mix is a listening item (mud risk).

**Dune Slinger**, the existing Auralith master = the current engine (no production master of it exists here).

| Metric | Source | Rock render | Pop render |
|---|---|---|---|
| LUFS | −17.94 | **−11.53** (req −11.5) | **−10.10** (req −10.0) |
| TP dBTP | −4.62 | −2.00 | −2.00 |
| Crest dB | 16.48 | **12.34** | **10.92** |
| PLR dB | 13.33 | 9.53 | 8.10 |
| LRA LU | 4.14 | 3.60 | 3.50 |
| Correlation | 0.895 | 0.893 | 0.893 |
| Mono fold-down loss LU | 0.23 | 0.25 | 0.25 |
| Punch retention | | 92.7 % (sat off: ~100 %) | 89.6 % |
| Pumping | | −0.51 dB | −0.61 dB |
| Limiter max / p99.5 GR | | 1.70 / 0.64 dB | 3.08 / 2.02 dB |
| Saturation drive | | 0.46 dB | 0.84 dB |
| Added distortion (worst) | | −23.42 dB | −22.33 dB |
| 20-120 Hz share | −6.97 dB | −6.14 (+0.83) | −6.07 (+0.90) |
| Band deltas sub / kick / upper bass | | +1.25 / +1.18 / +1.47 | +1.19 / +1.26 / +1.47 |
| high-mid / presence / high | | −1.22 / −1.20 / −0.56 | −1.11 / −1.10 / −0.43 |

Both are delivered `initial`, 1 render, no failures (rock: no warnings; pop: QC limiter warning). Output shas: rock `195412b1236d58ff`, pop `c8f7db4cc78a7797`.
Diagnosis: `insufficient_sub` (conf 0.90, 20-400 Hz) → two bells of +1.8 dB; dyn-EQ at 4.7 kHz; `weak_transients` mix note.

Hypotheses ("substantial loudness increase, reduced crest factor, reduced low-frequency energy"):
* Loudness increase: **VERIFIED** (+6.4 LU rock, +7.8 LU pop; pop-before +5.8 LU).
* Reduced crest: **VERIFIED** (−4.1 / −5.6 dB; pop-before −5.1 dB).
* Reduced low-frequency energy: **REJECTED** (+1.2 to +1.5 dB matched at 35-250 Hz; low share +0.8 to +0.9 dB; pop-before +0.4 to +1.0 dB).

Genre sensitivity: the tonal plan is genre-insensitive here. Genre changes only loudness (1.4 LU), limiter GR (+1.4 dB), saturation drive (×1.8) and
punch loss (+3.1 pts).

---

### C) Proposed fixes, ranked by expected quality gain vs risk

Every fix follows the same procedure: write a regression test that fails before the fix, run `python -m pytest -q`, run the synthetic gate
(`--synthetic --baseline benchmark/baselines/synthetic.json`) and the real gate (`--real --baseline benchmark/baselines/real.json`), rewrite only the rows
explained below in the same commit with a DECISIONS entry, and roll back by reverting the commit (the baselines travel with it).

**1. D3: true-peak ceiling follows the planned loudness (low risk, free quality).**
Change: in `planning/plan.py:build_mastering_plan`, after `_plan_loudness`, if `loudness.target_lufs <= params.STREAMING_REFERENCE_LUFS` (−14), set
`limiter["ceiling_dbtp"] = TRUE_PEAK_CEILING_DBTP` (−1.0) and **keep `target_lufs` unchanged** (do not recompute `achievable`, so the extra headroom
becomes less GR, not more loudness). Use one helper `_delivery_ceiling(target)` and call it again in `apply_user_tweaks_to_plan` (when the loudness tweak
moves the target) and in `backoff._lower_loudness` (lowering can only relax the ceiling). `TargetContext.ceiling_dbtp` stays as is, so
`test_preset_routing.py:50-52` is unaffected.
Expected: c07/f01 limiter GR 4.37 → 3.37 dB, punch loss 2.9 → 1.4 %, distortion −27.9 → −30.1 dB, TP −2.0 → −1.0, LUFS ±0.1.
Moves: synthetic rock_transient(_pro), dense_drums_edm(_pro) (TP −2 → −1, limiter GR −1 dB, retention up). Real baseline: no change (both > −14).
api_qa: c07, f01.
New test: a plan with target ≤ −14 has ceiling −1 and the same target; a plan with target > −14 keeps −2.
Check `test_preset_routing.py:85-96` (the "auto" case must stay above −14).

**2. D1: transient checks in relative units (low-medium risk; uses the existing backoff to trade loudness for punch).**
Change: in `mastering.py:236` pass `transient_delta = delta / src_score` (0 when `src_score < 0.15`, the same exemption as `evaluate.py:189`). In
`evaluate.py:187-189` compare `delta / src_score` with `allowed_loss`. Thresholds keep their documented meaning as fractions (0.12; 0.22 − 0.15 × priority).
Update the detail text to "%".
Expected: short_3s_pop (15.6 %), one_dead_channel_rnb (12.9 %) and dark_rock (9.0 %) fail initially → `corrective_1` with loudness −1.5 LU (nominal
relief), which roughly halves the loss on the measured curves. api_qa c03 (20.6 %) → corrective. Real tracks pass, but Dune pop 10.4 % vs pop limit
10.75 % has only 0.35 pt margin.
Moves: those 3 synthetic rows (delivered_candidate, master_lufs, retention, renders 1 → 2). Render time ×2 on them.
New test: a render with src 0.50 → 0.42 (abs −0.08, rel −16 %) must fail both checks. `test_band_levels.py:267` (−0.3) still fails as intended.

**3. D2: saturation only on explicit intent (medium risk, largest real-track punch gain).**
Change: in `target_model.py` keep the genre `base_saturation` out of the enabling allowance. Expose `saturation_intent` = category/flavour
`saturation_delta` + tag `saturation_delta` + `0.05 × warmth` + preset (a positive part only), and have `_plan_saturation` (`plan.py:482-501`) use it as
the allowance, with the factors unchanged. Remove the `identity` factor's dependence on the EQ change budget (`plan.py:493`).
Expected: Dune rock punch loss 7.3 → ~0 % (measured −0.1 % with saturation off) at −0.09 LU; saturation-blamed distortion gone; limiter GR 1.70 → 3.90 dB
(inside the 4.41 budget). Dune pop 10.4 → 9.8 %. c03 20.6 → 16.0 % at −0.62 LU (limiter cap binds).
Moves: 8 synthetic rows (listed in D2) and the real Dune row (retention, limiter max GR, distortion).
New test: no saturation without intent on a fixture where it is enabled today (e.g. thin_edm); a "warmer" tag still enables it;
`test_adaptive_engine.py:406-420` (forced saturation) is unchanged.
Risk: loses "colour" some listeners may want, and +2 dB limiter GR on Dune. **Needs a blind A/B on Dune rock (saturation on/off) before merge.**

**4. D4: polarity inversion corrected at input (low risk, removes a wasted multi-render refusal).**
Change: in `quality_control.validate_input_signal`, beside the silent-channel rule (`quality_control.py:104-112`): for stereo input with
`corr(L, R) < −0.5` (the existing output fail line, `quality_control.py:256`; no new threshold), flip the right channel, report
`polarity_corrected: "right"` and return the corrected audio. In `mastering.py` add warning code `polarity_corrected` ("Your file's channels were in
opposite polarity; the right channel was flipped before mastering. Check your mix export."); hand the i18n strings to the frontend owner.
Product alternative: refuse early with a specific `InvalidAudioError`. I recommend correcting, because an engineer would flip it and tell the client.
Expected: c09 is delivered like a normal pop mix (correlation about +0.9); normal stereo is bit-exact.
Moves: 0 synthetic rows; api_qa c09 FAIL → PASS. New test in `tests/test_input_limits.py` (inverted → delivered, correlation > 0.5, warning present;
normal stereo unchanged).

**5. D6: bounded, punch-aware loudness stop (medium risk, biggest "loudness last" lever; threshold needs listening and product sign-off).**
Change: in `render.py` bus stage (~L212-258), after the first bus render measure relative punch loss **pre-bus vs post-bus** (`_transient_metrics`, cheap;
pre-bus isolates the limiter, see R8). While loss > `C.BUS_PUNCH_LOSS_SOFT_LIMIT` (proposal 0.06) and `target − 0.5 ≥ acceptable_min_lufs`, re-run
`engine.bus` with target −0.5 LU (at most 4 steps, deterministic). Report `loudness_held_for_punch_lu` (flows into the existing `loudness_held_back` warning).
Expected (from the bus curves): pop-before −10.1 → about −10.6 LUFS (limiter loss 8.8 → ~6 %, GR about −0.6 dB); Dune pop −10.1 → about −11.0;
c01 −13.24 → −13.78 (floor), loss 10.7 → ~8 %.
Moves: most synthetic pop/edm rows (−0.3 to −0.8 LU) and both real rows. Render time +1 to 3 bus passes (seconds).
Do this **after** fixes 1-3, which remove part of the loss for free, and re-measure first.

**6. D7: no automatic boost for deficits entirely below 40 Hz (low risk, small gain).**
Change: in `plan.py:_plan_eq`, reject a `deficit` problem whose bands all have `hi_hz ≤ 40`, with reason "sub-40 Hz deficit: commonly an intentional
high-pass".
Expected: pop-before loses its 35 Hz +1.67 dB bell (subsonic +0.57 → ~0). Moves: 0 synthetic rows; real pop row (tiny). New test on a fixture with only
20-30 Hz missing.

**7. H1: dynamic EQ — no code change before listening.**
Run a blind A/B of Dune and pop-before with and without dyn-EQ. Separately, QA should add a section-varying synthetic fixture so the stage is exercised by
the gate. If listening confirms over-processing: require corroboration from the static diagnosis (harshness/resonance confidence ≥ cut gate) for nodes in
1-8 kHz, cap the passband at about 1 octave (Q ≥ 1.4), and add the dyn-EQ to the guardrail's planned basis.

Not proposed: limiter lookahead or release changes (R4), using the clipper for loudness (R5), stronger thin-mix boosts (R9, listening first), or lowering
`LIMITER_BUDGET_MAX_DB` globally (a blunt version of fix 5 that moves every row).

### Listening needs (PENDING, no human evidence)
Dune rock with saturation on vs off (fix 3) · pop-before at −10.1 vs −11.1 LUFS, level-matched (fix 5) · Dune and pop with and without dyn-EQ (H1) ·
pop-before low-mid +1.5 dB lift (mud?) · c07 at −1 vs −2 dBTP (fix 1; expected inaudible except less limiting).
