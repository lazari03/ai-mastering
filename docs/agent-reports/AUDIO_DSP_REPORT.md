# Audio DSP report: discovery audit (Step 1)

Agent: audio-dsp-engineer · Date: 2026-10-10 · Commit under test: `c88bc69` · Mode: **read-only**. No source, baseline or test files were changed.
Python 3.12 venv (`/home/user/venv-auralith`). Scratch scripts: `/tmp/claude-0/.../scratchpad/dsp/{c02,garbage,trans,rnb}.py`.

Evidence reused, not re-run: synthetic regression (`kb.py baseline`: 21 tracks, drift 0, baseline sha `52baad5f05fc5149`),
`backend/benchmark/baselines/synthetic.json` per-track rows, `test-results/auralith-qa.json` quick run (code_hash `e584db5a8f7cdd89`, 6 cases),
and `docs/audits/DSP_IMPROVEMENTS.md`, which is cited below rather than repeated.
New measurements: deterministic re-render of c02 (input sha256_16 `ac9a3c0bf2ed8923`, output `2ad8a59f26878db3`; it reproduces the QA numbers exactly),
plus direct `master_track` runs on 6 synthetic-corpus tracks to check transient-loss units and the `harsh_highs` reference frame.

## 1. Mandatory checklist

| # | Question | Verdict | Measurement · test id |
|---|---|---|---|
| 1 | Boosts highs unnecessarily? | **No defect** | c02: HF relative to the midrange is +0.12/+0.13 dB. The engine's own region check gives `hf_4k_14k` actual +0.151 dB, collateral −0.089 dB. Synthetic `unplanned_hf_max_db` peaks at 0.87 (wide_low_techno), limit 2.5. c04_harsh_pop: presence −1.63 dB, so the HF excess was cut. The QA `harsh_highs` flag is a false positive (§2). The HF gate and budget were already audited in DSP_IMPROVEMENTS §Tonal. Tests: api_qa `c02_bass_heavy_hiphop`, `c04_harsh_pop`; synthetic baseline. |
| 2 | Cuts bass excessively? | **No defect** | c02 (+8 dB excess at 40–250 Hz): kick_bass falls −3.22 dB relative to the midrange. That is a planned, legitimate correction (planned −0.31 / unplanned −0.41 dB loudness-matched). Synthetic `unplanned_low_end_min_db` is ≥ −0.58 (thin_edm), limit −2.0. Low-end collateral ≥ −0.774 (boomy_extreme_trap). Healthy fixtures: low_end_actual −0.003 (healthy_pop). Tests: api_qa c01/c02; synthetic baseline. |
| 3 | Damages drum transients? | **Defect (guardrail units)** | `GuardrailConfig.max_transient_loss = 0.12` is documented as a *fraction*, but `mastering.py:236` passes the *absolute* score delta (`evaluation.transients["delta"]`). With source scores around 0.5, the effective limit is about 24 % relative loss. Measured: short_3s_pop has source 0.4996, master 0.4219, a **15.6 % loss**, and passes the engine (delta −0.078 vs 0.12, evaluate.py allowed_loss 0.1075). benchmark `compare()` flags `lost_drums` on it. one_dead_channel_rnb: **12.9 %**, also passes the engine. rock_transient 4.5 %, dense_drums_edm 10.6 %, c07 2.9 %. Tests: synthetic tracks short_3s_pop and one_dead_channel_rnb through `scratchpad/dsp/trans.py`; baseline transient_retention min 0.844. |
| 4 | Adds distortion? | **No defect** | Synthetic `added_distortion_db` is at most −22.83 dB (dense_drums_edm) against the verdict line `MAX_ADDED_DISTORTION_DB = −18` (config.py:314). c02 measures −23.58 dB (blamed: saturation). No output clipping on any QA case. Tests: synthetic baseline; api_qa `no_output_clipping`. |
| 5 | Pumps at the limiter? | **No defect (watch)** | Pumping (HF dip on kick, limit −1.0 dB): c02 −0.71 and dense_drums_edm −0.65; every other case is ≥ −0.10. Limiter max GR is 5.7 dB on pop_48k against the 6 dB QC line (already a recorded watch item). The QC `limiter_gain_reduction` *warning* (> 3 dB) fires on 17 of 21 synthetic tracks, including healthy_pop. It has stopped telling tracks apart (see findings). Tests: api_qa c02; synthetic baseline. |
| 6 | Over-compresses dynamic material? | **No defect** | Compression stays off on 19 of 21 tracks. quiet_dynamic_jazz has PLR 15.04 dB and is held at −16 LUFS (DSP_IMPROVEMENTS §Dynamics). LRA change is at most ±0.32 LU over the corpus. c07_transient_rock: LRA 1.80 → 1.81, punch loss 0.029. Tests: synthetic baseline; api_qa c07. |
| 7 | Stereo or phase problems? | **No defect on measured cases** | QA correlation change is ≤ 0.014 and side/mid width change ≤ 0.8 dB on all 5 mastered cases. Synthetic correlation ≥ 0.848. The dead-channel case delivers dual-mono (corr 1.0, by design). The polarity-inverted case in `qa_corpus` was not part of the quick run, so the full run should cover it. Tests: api_qa c01–c19a; synthetic baseline. |
| 8 | Makes unnecessary moves? | **No defect** | c01_balanced_pop: every band delta is ≤ 0.26 dB, and that is close to uniform level-matching residue. healthy_pop: HF −0.001 / low −0.003 dB. The gate audit found 0 EQ moves on ±1/±1.5/±2 dB ripple fixtures (DSP_IMPROVEMENTS §Tonal). |
| 9 | Inconsistent across genres? | **Insufficient evidence** | Only pop reaches `MIN_TRACKS_PER_GENRE = 5` (6 tracks). Every other genre has 1–4 synthetic tracks, and there is no real corpus (AURALITH-QA-001 BLOCKED). |
| 10 | Falls back to ineffective processing when correction is needed? | **No defect (listening needed)** | c02 delivered `initial` after 1 render with a real EQ correction, not a fallback. boomy_extreme_trap (+12 dB) delivered `corrective_1`, still corrected (the d9c591a fix, pinned by the baseline). The correction is partial by design: c02 low-band energy share 96.0 % → 93.1 %, and about 3 dB of an 8 dB excess is removed under the 3 dB max-cut planner cap. Only listening can say whether that is enough. |

## 2. c02_bass_heavy_hiphop `harsh_highs` 2.63 dB: reference-frame artifact, not an HF boost

The re-render is deterministic and matches the QA JSON to 0.01 dB. Per-band deltas (dB, loudness-matched to whole-mix LUFS):

| Band | compare()/measured | planned EQ | unplanned (engine basis) | relative to mid 500–2k |
|---|---|---|---|---|
| subsonic 20–35 | +1.29 | +1.31 | −0.02 | −1.21 |
| sub 35–60 | +0.79 | +0.21 | +0.59 | −1.71 |
| kick_bass 60–120 | −0.72 | −0.31 | −0.41 | **−3.22** |
| upper_bass 120–250 | −0.43 | −0.38 | −0.05 | **−2.93** |
| low_mid 250–500 | +1.98 | +1.15 | +0.83 | −0.52 |
| mid 500–2k | +2.50 | +1.95 | +0.55 | 0.00 |
| high_mid 2–4k | +2.63 | +2.08 | +0.55 | +0.13 |
| presence 4–6k | +2.62 | +2.08 | +0.54 | **+0.12** |
| high 6–20k | +2.63 | +2.09 | +0.54 | **+0.13** |

- The mix is 96 % low-band energy, so loudness matching against the whole mix after a legitimate bass cut raises every band above 250 Hz by the same amount, about +2.5 dB. The mids rise +2.50 and the highs +2.63. That is a level shift, not a tilt.
- The engine's own frame removes this shift. `output_validation.validate_render` measures its absolute caps against `MID_REFERENCE_BAND` for exactly this case (comment at output_validation.py ~L146, commit d9c591a), and `benchmark/regression.py` scores planned and unplanned movement separately. On those bases the HF movement is +0.12/+0.13 dB relative to the mid, `unplanned_hf_max` is +0.54 dB (limit 2.5), and `tilt_drift` is 0.062 dB/oct (limit 0.3). The evaluation region `hf_4k_14k` gives actual +0.151 dB, collateral −0.089 dB. Initial failures: none.
- `benchmark/metrics.compare()` compares raw loudness-matched deltas with `max_high_boost_db`. It does not subtract the midrange shift and does not know the plan, so it is stricter than, and inconsistent with, the engine guardrail it imports.
- The same artifact appears elsewhere. boomy_extreme_trap: compare() gives `high_change` 3.54 → **harsh_highs**, while relative to mid it is +0.17/+0.16. one_dead_channel_rnb: compare() gives `high_change` 3.30 → **harsh_highs**, while relative to mid it is 0.00. That one is a uniform shift caused by mono-izing a source that had one silent channel. bass_heavy_hiphop: 2.05 (not flagged), relative to mid +0.09.
- **Verdict:** this is not a DSP defect. It is a benchmark-metric defect in `benchmark/metrics.py:compare()`, owned by qa-automation-engineer (component `regression.synthetic`). The suggested fix is to measure `harsh_highs` and `weaker_bass` as band delta minus `mid_500_2000hz` delta, which is the engine's `MID_REFERENCE_BAND` rule, or to report planned and unplanned movement separately as regression.py does. A caveat: the engine's "unplanned" +0.54 dB above 250 Hz is itself mostly the same level offset. The realised bass cut came out about 0.4–0.8 dB deeper than planned, and matching then lifts everything else. It is well inside the limits.

## 3. Undecodable input → HTTP 500 `NoBackendError`

Reproduced with the `c20a_garbage` bytes (`scratchpad/dsp/garbage.py`). The chain is:

1. `app/services/mastering_service.py:241` `_enforce_max_duration` → `_probe_duration_s` returns **None**: `sf.info` and ffprobe both fail, and the function returns None by design, leaving the decode step to report the problem. `.wav` is not in `AUDIO_DECODE_EXTS` (L30), so ffmpeg never runs.
2. `ai_mastering/mastering.py:325` `_load_audio(input_path, ...)`.
3. **`ai_mastering/audio_utils.py:101`** `sf.read` raises `LibsndfileError: Format not recognised`. That is caught by the bare `except Exception` (L103), which falls back to **`audio_utils.py:107` `librosa.load`** → audioread → `audioread.exceptions.NoBackendError` (a `DecodeError`, empty message). This happens even though `/usr/bin/ffmpeg` exists: audioread tries every backend and they all fail. Nothing catches it.
4. `app/services/mastering_service.py:525-526` generic `except Exception` → `HTTPException(500, "Adaptive mastering failed: NoBackendError: ")`.
5. `app/api/routes/mastering.py:300` maps `WorkerError` 500 → error code `render_failed`.

- **Root cause:** the DSP loader turns "not audio" into a raw third-party exception instead of the engine's `InvalidAudioError` (quality_control.py:39). The service already maps that exception to 400 at L520 and the route maps it to `invalid_audio`.
- **Owner:** audio-dsp-engineer (`dsp.bus` owns `ai_mastering/audio_utils.py`).
- **Smallest correct fix:** in `_load_audio`, wrap the librosa fallback: `except Exception as exc: from .quality_control import InvalidAudioError; raise InvalidAudioError("The uploaded file could not be decoded as audio (unsupported or corrupt format).") from exc`. The import is lazy because `quality_control` imports `audio_utils` at module top, so a top-level import would create a cycle. This one change covers master input and reference (mastering.py:325, :344), `analyze_for_preview` (:64), the preset engine (`preset_dsp_engine` already maps InvalidAudioError to 400 in the service, L492) and stem loading. No DSP behaviour changes for decodable files, so synthetic drift should be 0.
- **Secondary (backend-engineer, `python.api`):** `mastering_service.py:269-270` raises `HTTPException(500, "Input decode failed")` when ffmpeg fails on a compressed upload (.mp3/.m4a/...). A corrupt MP3 is a client error and should return 400 (`invalid_audio`). File this as a handoff; it is not DSP-owned.
- **Regression tests (each must fail before the fix):**
  - `backend/tests/test_input_limits.py`: write seeded random bytes to `x.wav`. Assert that `master_track` raises `InvalidAudioError` and that no output file exists. Do the same for `_load_audio` directly.
  - `backend/tests/test_master_route_jobs.py` (backend-engineer): POST `/master` with the garbage bytes → 400 with code `invalid_audio`, the job state is `failed`, and no credits are consumed upstream. Also POST `/analyze` → 400.
  - The `c20a_garbage` api_qa case is expected to flip from FAIL to PASS.

## 4. Findings and recommended actions

| # | Finding | Severity | Owner | Action |
|---|---|---|---|---|
| F1 | Undecodable upload returns 500 `render_failed` instead of 400 `invalid_audio` | P2 | audio-dsp-engineer (audio_utils.py:107), with backend-engineer for the ffmpeg path at service L270 | Apply the fix and tests in §3 (Step 2, with approval). |
| F2 | Transient guardrail compares an absolute score delta with a limit documented as a fraction (0.12). The effective tolerance is about 2× looser: 15.6 % and 12.9 % punch loss pass the engine. | P2 | audio-dsp-engineer (output_validation.py:281 / mastering.py:236) | Decide the intended unit (DECISIONS entry). If the limit is meant as relative, pass `delta/src_score`. That will change the verdict on short_3s_pop and one_dead_channel_rnb, so it needs a baseline rewrite in the same commit, before/after numbers and listening. Do not change it without that evidence. |
| F3 | `benchmark.metrics.compare()` `harsh_highs`/`weaker_bass` are judged against whole-mix loudness without removing the midrange shift. False positives on c02 (2.63), boomy_extreme_trap (3.54) and one_dead_channel_rnb (3.30). | P3 | qa-automation-engineer (`regression.synthetic`) | Use the mid-referenced (or planned/unplanned) basis, matching `output_validation`. Re-classify c02 from PASS_WITH_ANOMALIES to PASS once that is done. |
| F4 | The QC `limiter_gain_reduction` warning (> 3 dB) fires on 17 of 21 synthetic tracks, including healthy_pop, so the user-facing "listen for pumping" warning carries little information | P3 | audio-dsp-engineer and mastering-engineer | Leave as is until there is listening evidence. Then calibrate the warn line or tie it to measured pumping (c02 −0.71 and dense_drums_edm −0.65 are the only cases with a real kick-HF dip). |
| F5 | Watch item: tightest margins remain limiter max GR 5.7/6.0 dB (pop_48k) and pumping −0.71/−1.0 dB (c02) | info | audio-dsp-engineer | Keep tracking in the baseline. |

## 5. Listening needs (status PENDING; no human evidence)

- c02 and boomy_extreme_trap: is the partial bass correction (about 3 dB of an 8–12 dB excess) enough, and does the master sound brighter? Objectively it does not (HF +0.13 dB relative to mid).
- short_3s_pop and one_dead_channel_rnb: is the 13–16 % measured punch loss audible? This input is needed before F2 is decided.
- c02 and dense_drums_edm: audible pumping at −0.65 to −0.71 dB kick-correlated HF dip?
- Genre consistency (item 9) needs the real-music corpus (AURALITH-QA-001).
