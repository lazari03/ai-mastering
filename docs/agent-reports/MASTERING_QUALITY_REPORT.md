# Mastering quality report: evaluation of the latest QA lab results

Agent: mastering-engineer · Date: 2026-10-10 · HEAD `677d56a` · Mode: **read-only, no re-render.** No code, baseline or issue file was changed.

**I cannot hear.** Every statement below is labelled **VERIFIED** (measurement), **HYPOTHESIS**, or **HUMAN-VERIFIED**. There is no HUMAN-VERIFIED statement in this report. Human-listening status is **PENDING for every case**.

**All test material is synthetic** (generated mixes from `backend/benchmark/qa_corpus.py`: tones, noise, programmatic drums, spectral-offset transforms). Synthetic signals are not music. They can expose gross defects (bass loss, HF boost, clipping, phase). They cannot show that a master sounds good on a real mix. **Real-music evidence is BLOCKED (AURALITH-QA-001, P0)**: `backend/benchmark/corpus/` is absent and there is no listening evidence.

## 0. Evidence validity

| Item | Recorded | Now |
|---|---|---|
| `kb.py baseline` `api_qa.code_hash` | `e584db5a8f7cdd89` (commit `69e7a60`) | `kb.py codehash` = `0ba713d3237f1451` |
| `test-results/auralith-qa.json` `code_hash` | `e584db5a8f7cdd89` | same mismatch |

**Verdict: the hashes do not match, so under the reuse rule (`TEST_BASELINES.json` `_schema`) the recorded results are NOT certified valid for the current tree.**
Supporting facts (VERIFIED): the working tree is clean; `git diff 69e7a60 HEAD` touches only `benchmark/api_qa.py`, `benchmark/qa_corpus.py` (neither is in `DSP_HASH_GLOBS`), docs and JSON, and nothing under `backend/ai_mastering/`, `backend/app/` or `benchmark/metrics.py`. So the DSP code that produced the numbers appears unchanged since the run. The most likely cause of the mismatch is that the run happened on an uncommitted tree, or the hash-glob set changed after the run (HYPOTHESIS; I did not check out `69e7a60`). I use the numbers as **provisional evidence** below. qa-automation-engineer should re-run `python -m benchmark.api_qa` (or reconcile the hash) before anyone relies on them in a gate. Per-case `input_hash` content hashing is separate and unaffected by this.

The QA run covers 30 cases: 27 mastered, 6 refused or failed on input handling (c09, c13, c20a-c, f04). Features tested are Standard and Professional tier, club category, MP3 output, reference mastering, tag and tweak.

## 1. Per-case evaluation

### 1a. Measurements (VERIFIED, from `measured_input`, `measured_output`, `comparison_loudness_matched`)

Columns: integrated LUFS in → out (requested target); true peak dBTP; LRA (LU); crest (dB); low-end / high change in dB at matched loudness (`low_end_change_db` / `high_change_db`); punch loss (`punch_loss`, positive = loss); pumping (HF dip on kick, dB; limit −1.0); stereo correlation and side/mid dB. `processing_applied` is not stored in the QA JSON (`engine_reported.verdict` is null for every case), so processing is inferred from the band deltas.

| Case | LUFS | TP | LRA | Crest | Low / High | Punch loss | Pump | Width / correlation |
|---|---|---|---|---|---|---|---|---|
| c01_balanced_pop | -18.0 → -13.2 (-12.96) | -1.96 → -2.01 | 2.57 → 2.56 | 17.3 → 12.5 | -0.26 / +0.23 | +0.107 | -0.07 | 0.892 → 0.886; S/M -12.44 → -12.17 |
| c02_bass_heavy_hiphop | -18.0 → -13.1 (-13.07) | -1.62 → -2.00 | 1.61 → 1.74 | 17.1 → 11.8 | -0.72 / +2.63 | +0.087 | -0.71 | 0.926 → 0.912; S/M -14.17 → -13.35 |
| c03_thin_edm | -18.0 → -11.0 (-10.78) | -3.39 → -2.01 | 3.35 → 3.04 | 16.0 → 10.3 | +0.46 / -0.49 | +0.206 | -0.63 | 0.885 → 0.876; S/M -12.16 → -11.79 |
| c04_harsh_pop | -18.0 → -12.7 (-12.21) | -2.55 → -2.01 | 2.84 → 2.68 | 17.0 → 12.2 | +0.03 / -0.80 | +0.108 | -0.10 | 0.895 → 0.891; S/M -12.55 → -12.40 |
| c05_overcompressed_edm | -8.0 → -8.0 (-8.0) | -4.10 → -3.25 | 2.20 → 2.15 | 5.1 → 6.0 | -0.03 / -0.14 | -0.008 | +0.00 | 0.870 → 0.872; S/M -11.57 → -11.65 |
| c06_dynamic_jazz | -24.0 → -16.0 (-16.0) | -7.68 → -1.00 | 4.67 → 4.64 | 17.4 → 16.1 | -0.02 / +0.01 | +0.006 | -0.00 | 0.905 → 0.905; S/M -13.01 → -13.00 |
| c07_transient_rock | -19.7 → -17.3 (-17.07) | -0.26 → -2.01 | 1.80 → 1.81 | 20.5 → 16.4 | -0.29 / +0.17 | +0.029 | -0.02 | 0.902 → 0.898; S/M -12.90 → -12.68 |
| c08_presence_vocal_proxy | -18.0 → -15.5 (-15.5) | -3.62 → -1.00 | 3.31 → 3.18 | 16.3 → 16.3 | +0.45 / +0.51 | -0.028 | -0.01 | 0.861 → 0.869; S/M -11.28 → -11.56 |
| c10_mono_acoustic | -21.3 → -15.0 (-15.0) | -2.28 → -1.00 | 2.44 → 2.40 | 17.0 → 15.1 | -0.03 / +0.03 | +0.010 | -0.00 | 1.000 → 1.000; S/M mono → mono |
| c11_clipped_metal | -5.2 → -7.3 (-7.2) | 0.37 → -2.02 | 2.58 → 2.55 | 6.4 → 6.4 | -0.01 / +0.01 | -0.002 | -0.04 | 0.883 → 0.882; S/M -12.06 → -12.05 |
| c12_quiet_classical | -32.0 → -19.0 (-19.0) | -16.55 → -3.55 | 2.67 → 2.67 | 16.6 → 16.6 | +0.00 / +0.00 | +0.000 | +0.00 | 0.906 → 0.906; S/M -13.06 → -13.06 |
| c14_dc_offset | -18.0 → -13.8 (-13.52) | -1.22 → -2.00 | 2.32 → 2.35 | 17.1 → 12.9 | -0.22 / +0.21 | -0.355 | -0.05 | 0.917 → 0.894; S/M -13.64 → -12.54 |
| c15_lr_imbalance | -20.4 → -15.5 (-15.04) | -1.49 → -2.00 | 2.44 → 2.48 | 19.9 → 14.6 | -0.22 / +0.24 | +0.105 | -0.03 | 0.909 → 0.904; S/M -6.37 → -6.32 |
| c16_short_2s | -18.0 → -13.5 (-13.16) | -2.23 → -2.00 | 1.01 → 1.01 | 16.7 → 12.5 | -0.27 / +0.29 | +0.126 | -0.05 | 0.893 → 0.885; S/M -12.47 → -12.15 |
| c17_long_180s | -18.0 → -12.6 (-12.46) | -0.66 → -2.01 | 2.50 → 2.54 | 18.4 → 11.8 | -0.43 / +0.29 | +0.119 | -0.56 | 0.905 → 0.892; S/M -13.00 → -12.44 |
| c18a_sr_48k | -18.0 → -13.3 (-12.98) | -2.11 → -2.01 | 2.55 → 2.52 | 17.0 → 12.4 | -0.35 / +0.26 | +0.113 | -0.07 | 0.902 → 0.895; S/M -12.87 → -12.56 |
| c18b_sr_96k | -18.0 → -13.3 (-12.99) | -1.78 → -2.00 | 2.50 → 2.52 | 17.3 → 12.4 | -0.25 / +0.23 | +0.099 | -0.03 | 0.902 → 0.896; S/M -12.87 → -12.59 |
| c18c_sr_22k | -18.0 → -13.1 (-13.0) | -2.37 → -2.00 | 2.42 → 2.44 | 16.7 → 12.2 | -0.37 / +0.24 | +0.111 | -0.57 | 0.906 → 0.895; S/M -13.05 → -12.55 |
| c19a_pcm16 | -18.0 → -13.3 (-12.98) | -2.32 → -2.01 | 2.46 → 2.54 | 16.8 → 12.4 | -0.27 / +0.25 | +0.099 | -0.07 | 0.906 → 0.900; S/M -13.06 → -12.77 |
| c19b_pcm24 | -18.0 → -13.2 (-12.9) | -2.31 → -2.01 | 2.40 → 2.42 | 16.8 → 12.4 | -0.32 / +0.28 | +0.107 | -0.08 | 0.904 → 0.897; S/M -12.99 → -12.65 |
| c19c_pcm32 | -18.0 → -13.2 (-12.89) | -2.02 → -2.01 | 2.49 → 2.50 | 17.1 → 12.3 | -0.28 / +0.27 | +0.113 | -0.08 | 0.904 → 0.896; S/M -12.95 → -12.62 |
| f01_professional_tier | -19.7 → -17.3 (-17.07) | -0.26 → -2.01 | 1.80 → 1.81 | 20.5 → 16.4 | -0.29 / +0.17 | +0.029 | -0.02 | 0.902 → 0.898; S/M -12.90 → -12.68 |
| f02_category_club | -18.0 → -12.6 (-12.46) | -1.61 → -2.01 | 2.47 → 2.55 | 17.6 → 11.8 | -0.44 / +0.29 | +0.103 | -0.57 | 0.903 → 0.889; S/M -12.91 → -12.32 |
| f03_output_mp3 | -18.0 → -13.0 (-12.51) | -1.57 → -1.86 | 2.55 → 2.60 | 17.6 → 12.3 | -0.30 / +0.25 | +0.114 | -0.07 | 0.903 → 0.897; S/M -12.95 → -12.65 |
| f05_reference_mastering | -18.0 → -14.9 (-14.75) | -0.80 → -2.00 | 2.49 → 2.47 | 18.2 → 13.9 | -0.47 / +1.99 | +0.034 | -0.03 | 0.906 → 0.900; S/M -13.06 → -12.80 |
| f06_tags_warmer | -18.0 → -12.9 (-12.75) | -2.11 → -2.01 | 2.35 → 2.42 | 17.0 → 12.0 | -0.42 / +0.20 | +0.124 | -0.57 | 0.906 → 0.893; S/M -13.06 → -12.48 |
| f07_tweaks_brightness | -18.0 → -13.2 (-12.77) | -1.44 → -2.01 | 2.37 → 2.33 | 17.7 → 12.4 | -0.32 / +0.52 | +0.110 | -0.08 | 0.903 → 0.895; S/M -12.92 → -12.57 |

Not mastered: c09 phase-inverted (HTTP 400, after a full render, AURALITH-AUDIO-002), c13 near-silent (clean 400), c20a garbage and c20c empty (HTTP 500; AURALITH-AUDIO-004 names garbage only), c20b truncated (clean 400), f04 FLAC (clean 400, an expected refusal; the JSON still marks it FAIL because the run predates the corpus fix in `677d56a`).

### 1b. Interpretation per case

Conf = my confidence that the measurement-based judgement is right for this synthetic input. It is not a statement about real music.

| Case | Source characteristics | Processing summary (inferred) | Potential defects | Conf | Recommended action | Listening |
|---|---|---|---|---|---|---|
| c01_balanced_pop | Balanced pop, −18 LUFS, crest 17.3 | Level raise +4.8 LU to −13.2; band deltas ≤ 0.26 dB, i.e. uniform | Crest −4.8 dB, punch loss 0.107 (typical of this corpus, see O6) | med | None. Use as the "healthy" reference pair | PENDING |
| c02_bass_heavy_hiphop | +8 dB at 40–250 Hz, 96 % low-band energy | Bass cut, rest raised by level matching | QA `harsh_highs` 2.63 is a reference-frame artifact (DSP report §2, agreed); pumping −0.71 is the worst in the QA set; correction partial (O2) | med | Listen to bass amount and kick/bass weight | PENDING |
| c03_thin_edm | Thin, low 62.6 % energy, crest 16.0 | +7.0 LU to −11.0; low +0.46, sub +0.66, upper bass +0.97 dB; highs −0.49 | **Punch loss 0.206 (limit 0.12, `lost_drums`): the largest in the set**; crest −5.7 dB; pumping −0.63; thinness barely corrected | med | Feed to audio-dsp-engineer as AURALITH-AUDIO-001 evidence (worst case); listen to kick punch and bass body | PENDING |
| c04_harsh_pop | HF excess, 4k+ share 3.6 % | Presence −1.63 dB, high-mid −0.66, 6k+ −0.80 at matched loudness; 4k+ share → 2.5 % | None measured; over-darkening is untested | med-high | Listen for dullness | PENDING |
| c05_overcompressed_edm | Pre-limited −8 LUFS, crest 5.1 | Essentially bypassed: Δ ≤ 0.14 dB, loudness unchanged, TP −4.1 → −3.25 | None. Engine correctly refuses to push further | high | None | PENDING (null control) |
| c06_dynamic_jazz | Dynamic, −24 LUFS, TP −7.7, LRA 4.7 | Gain-only +8 LU to −16.0; all deltas ≤ 0.02 dB; LRA kept; crest −1.3 dB | TP −1.0 (others −2.0), see O9 | high | None; listen for naturalness at +8 dB | PENDING |
| c07_transient_rock | Transient drums, crest 20.5, TP −0.26 | +2.4 LU to −17.3; punch loss 0.029; crest −4.1 | Output −17.3 LUFS is quiet for rock (O1) | med | Product decision on rock target | PENDING |
| c08_presence_vocal_proxy | Presence-band proxy (no voice) | Low +0.45; mid-band −0.4/−0.3; highs +0.5 | A proxy cannot say anything about vocal intelligibility | low | Real vocals needed (QA-001) | PENDING |
| c10_mono_acoustic | 1-channel file | Delivered as 2-channel dual-mono (corr 1.000); Δ ≤ 0.03 dB; +3.3 LU to −15.0 | None; engine warns "nothing to widen" | high | None | PENDING |
| c11_clipped_metal | Hard-clipped (+14 dB into clip), −5.2 LUFS, TP +0.37 | Attenuated 2.1 LU to −7.3, TP −2.0, no tonal change (Δ ≤ 0.015) | Existing clip flats are retained (cannot be undone); output −7.3 is still above the engine's stated genre ceiling of −9 | med | Listen to clip harshness; see O5 | PENDING |
| c12_quiet_classical | −32 LUFS, TP −16.6 | Gain-only +13 LU to −19.0; every delta 0.0; crest/LRA identical | None. Pure gain | high | None | PENDING |
| c14_dc_offset | +0.05 DC | DC removed, +4.2 LU; deltas ≤ 0.22 | **Punch "loss" −0.355** (a gain) is implausible, see N1 | low | Do not read this metric | PENDING |
| c15_lr_imbalance | R −8 dB | Balance preserved (S/M −6.37 → −6.32); deltas ≤ 0.26 | None | high | None | PENDING |
| c16_short_2s | 2 s pop | As c01; punch loss 0.126 flagged `lost_drums` | Within 0.007 of the pop-typical 0.10–0.12, see O6 | low | Do not listen; too short | PENDING |
| c17_long_180s | 180 s house | As c01; low −0.43; pumping −0.56 | Section-level behaviour over 3 min unverified | med | Listen to 2–3 sections | PENDING |
| c18a/b/c sr 48k/96k/22k | Same pop mix at three sample rates | Matches c01 within 0.1 dB; c18c pumping −0.57 | None | high | None (format check) | PENDING |
| c19a/b/c 16/24/32-bit | Same pop mix at three bit depths | Matches c01 within 0.1 dB | None | high | None | PENDING |
| f01_professional_tier | Same audio as c07 | **Identical to c07 to every reported digit** | Professional adds nothing measurable here (AURALITH-PRODUCT-001) | high (that they are identical) | See O7 | PENDING |
| f02_category_club | EDM, club category | Low −0.44, high +0.29, to −12.6; pumping −0.57 | Club target −12.6 is quieter than c03 EDM −11.0 | low | Listen only after O1 is decided | PENDING |
| f03_output_mp3 | Pop, MP3 out | As c01; TP −1.86 after the lossy encode | Encode overshoot is small; within −1.0 | high | None | PENDING |
| f05_reference_mastering | Dark rock (4k+ share 0.2 %) vs balanced pop reference | High +1.99, presence +1.73 at matched loudness; 4k+ share 0.2 → 0.3 % | Partial match only, see O8 | med | Listen against the reference | PENDING |
| f06_tags_warmer | Pop, tag "warmer" | Low-mid +0.45 dB, low −0.42, 6k+ +0.08; punch loss 0.124 flagged | "Warmer" is a +0.2 dB low-mid shift at best; flag is noise-level (O6) | low | Listen: is "warmer" audible? | PENDING |
| f07_tweaks_brightness | Pop, brightness +0.5 | High +0.52 vs ~+0.25 for the untweaked pop controls | Effect is about +0.27 dB; likely inaudible | med | Listen | PENDING |

## 2. Cross-case observations

**O1. Loudness target per genre (VERIFIED numbers, HYPOTHESIS on appropriateness).** Delivered LUFS: EDM c03 −11.0 and club EDM f02 −12.6, hip-hop −13.1, pop −12.6 to −13.5, singer-songwriter −15.5, acoustic −15.0, jazz −16.0, rock c07 −17.3 and f05 −14.9, classical −19.0, metal c11 −7.3 (constraint, not target), over-compressed EDM c05 −8.0 (kept). Streaming platforms normalise to about −14 LUFS, so −17 to −19 is quieter than anything needs, and −8 is turned down anyway. The values are plausible for jazz and classical. Rock at −17.3 (c07/f01) is HYPOTHESIS "too quiet": the same genre is −14.9 in f05, and −17.3 is below the pop outputs by about 4 LU. It looks like the target follows source crest (20.5 dB) rather than genre. Whether that is intended, and whether listeners prefer it, needs a product decision plus listening.

**O2. Deliberate flaws, how much was corrected.**
- c02 bass (VERIFIED): the engine removes about 3 dB of an 8 dB excess. Relative to the mid band, kick_bass is −3.22 dB and upper_bass −2.93 dB; low-band energy share 96.0 → 93.1 %. This is by design (planner cap 3 dB), so the master is still extremely bass-heavy (HYPOTHESIS: audible).
- c03 thin (VERIFIED): low-band share 62.6 → 65.3 %, sub +0.66, kick +0.46, upper bass +0.97 dB at matched loudness, highs −0.49. This is a mild correction (planner low boost cap 1.5 dB). The master is not "full" by measurement (HYPOTHESIS: still thin). The 7 LU gain and the crest loss of 5.7 dB are the dominant change.
- c04 harsh (VERIFIED): the clearest correction. Presence −1.63, high-mid −0.66, 6k+ −0.80 dB; 4k+ share 3.6 → 2.5 %. HYPOTHESIS: reads as less harsh; may be slightly dark. This is the strongest of the three.

**O3. Transient handling (VERIFIED numbers, HYPOTHESIS meaning).** `lost_drums` fires on c03 (0.206), c16 (0.126) and f06 (0.124). The numbers show punch loss is a property of the gain, not of one drum type: c07, with a 20.5 dB crest and only a +2.4 LU raise, loses 0.029, while c03 (+7.0 LU) loses 0.206. Roughly speaking, the louder the raise, the larger the punch loss. This supports AURALITH-AUDIO-001 (guardrail ~2× looser than documented) in direction, and the c03 value is a worse case than the DSP report's 15.6 %.

**O4. Dynamic material c06, c12 (VERIFIED).** Both are handled gain-only. All band deltas ≤ 0.02 dB, LRA unchanged, crest −1.3 dB (c06) or 0.0 (c12). Good by measurement. The open question is listening: at +8 and +13 LU of pure gain, is the result natural and not noisy (noise floor lifts with the same gain)? c12 TP of −3.55 leaves limiter headroom unused.

**O5. Clipped input c11 (VERIFIED).** No de-clipping or restoration; the master is the source attenuated by 2.1 dB with TP made legal, tonal Δ ≤ 0.015 dB. Honest outcome; the flat tops remain. The warning text "louder than this genre/delivery range (up to −9.0 LUFS)" is true of the master (−7.3) as well, so the engine does not enforce its own stated range when it has chosen not to clip further (HYPOTHESIS: ambiguous message).

**O6. Punch loss baseline (VERIFIED count, HYPOTHESIS interpretation).** 13 of the pop and house mastered cases (c01, c04, c15, c17, c18a-c, c19a-c, f02, f03, f07) lie between 0.099 and 0.119, with `lost_drums` at 0.12. The two pop flags (c16 0.126 and f06 0.124) are just the upper tail of that same cluster, with crest dropping about 4.5 to 6.6 dB from the 17 dB source in every case. So the flag is a threshold sitting on top of the normal distribution, and every +4.7 LU master is within 0.01 of firing it. This sharpens the DSP report's reading: item 3 is not a rare edge case; the typical result is about 10–12 % absolute punch loss. Whether that is audible is the key listening question for c01, c03, c17.

**O7. Standard vs Professional, c07 vs f01 (VERIFIED).** Same audio, identical in every reported number (LUFS, TP, LRA, crest, all band deltas, punch loss, correlation). DSP_KNOWLEDGE confirms the engines differ only in sub/punch compression when the plan compresses, and c07 does not compress. This supports AURALITH-PRODUCT-001 (P1) and shows the pair is **uninformative as a test**; a valid Standard-vs-Pro comparison needs a case where the plan compresses (candidates: c03, c17). It is included in the listening plan only as an identity control.

**O8. Reference mastering f05 (VERIFIED).** The reference is c01 (4k+ share 1.1 %). The dark rock input moves in the right direction (6k+ +1.99 dB, presence +1.73 dB at matched loudness; low −0.47) but the 4k+ energy share only goes 0.2 → 0.3 %, against 1.1 % in the reference. The source was built with a −7.5 dB spectral offset above 3 kHz, so about a quarter of the gap is closed (HYPOTHESIS: the reference EQ cap, boost ≤ 2.5 dB, is the limiter). Genre also differs (rock vs pop reference). Whether "partial" sounds like matching is a listening question.

**O9. True-peak ceiling is not uniform (VERIFIED, HYPOTHESIS cause).** Most masters land at −2.0 dBTP; c06, c08 and c10 land at −1.0 and c12 at −3.55. The c11 warning says "delivery needs −2 dBTP or lower". If the ceiling is delivery- or genre-dependent, the user-facing message is inaccurate for those cases (listed as N3). Not harmful to the audio.

**O10. Stereo (VERIFIED).** Correlation change ≤ 0.026 and S/M change ≤ 1.1 dB (c14 is the largest; c02 0.8) on all 27 mastered cases. No phase or width defect measured. The phase-inverted source (c09) never reaches a master: it is rejected with HTTP 400 after a full render (AURALITH-AUDIO-002).

**O11. Challenge to "harsh_highs" on c02 (VERIFIED, agree with the DSP report).** The +2.63 dB is the 96 %-bass level-matching offset. Relative to the mid band, highs are +0.13 dB.

## 3. Blind listening plan (for humans; nothing has been run)

Tool: `backend/benchmark/blind_ab.py` (usage per its docstring; from `backend/`):
1. Build a level-matched set per pair with neutral letters and a `listening_key.json` (written by `run_benchmark.py` / `calibration_ab.py`; there is no builder yet for the QA cases, whose files are in `test-results/audio/<case>/{source,master}.wav`. This is an action for the mastering-engineer owner of `blind_ab.py`; it needs a small adapter, not a DSP change).
2. `python -m benchmark.blind_ab template benchmark/results/<set> --listener <name>` writes `ballots/<name>.json`; the listener ranks letters per track, best first, and fills `notes` (drums, bass, highs, pumping).
3. `python -m benchmark.blind_ab tally benchmark/results/<set>` writes `preference.json` and `preference.md`.

**Level matching.** Match to the lower LUFS by **attenuating the louder file** (the master); never gain up the source, which would clip on c06/c12. Verify with an external LUFS meter; loudness differences of 0.5 dB bias preferences. Randomise A/B order per listener. Do not tell listeners which letter is the master.

**Pairs (15 tracks; `blind_ab` requires MIN_TRACKS = 15 and MIN_LISTENERS = 3 or status stays "pending")**

| # | Pair | What to judge |
|---|---|---|
| 1 | c01 source vs master | Baseline: is the typical pop result better, same, or worse? |
| 2 | c02 | Bass amount, kick/bass weight, brightness; pumping |
| 3 | c03 | Punch of kick/drums, bass body (thin or full), pumping |
| 4 | c04 | Harshness, dullness (over-correction) |
| 5 | c05 | Null control: expected indistinguishable |
| 6 | c06 | Naturalness of dynamics; noise lifted by +8 dB? |
| 7 | c07 | Drum punch (low-loss control) |
| 8 | c08 | Tonal change only (proxy; not vocal intelligibility) |
| 9 | c10 | Dual-mono image; any widening artifacts |
| 10 | c11 | Clip harshness, distortion, loudness |
| 11 | c12 | Null-ish control: gain only; noise floor |
| 12 | c17 (excerpts from 3 sections) | Pumping, section consistency |
| 13 | f06 source vs master | Is "warmer" audible, and does punch hold? |
| 14 | f05 source vs master vs reference | Does the master move toward the reference? (3-way) |
| 15 | c07 Standard vs f01 Professional | Identity control: expected "no preference" |

Ask listeners to judge: preference (ranking), then notes on drums/punch, bass, highs, pumping. For null and identity controls (5, 11, 15), a consistent preference would indicate bias or a method fault. With 3+ listeners and 15 tracks, results can only claim "preference on synthetic signals". They cannot unblock real-music quality.

**Recording.** Ballots in `backend/benchmark/results/<set>/ballots/`; tally output beside them. Then the mastering-engineer records: (a) a note on AURALITH-QA-001 (`listening.blind_ab`); (b) `kb.py handoff-add --task <ID> --agent mastering-engineer ...` with evidence = this report; (c) the `listening_status` field of the next `api_qa` baseline; (d) results that implicate DSP (c03 punch, c02 bass, O1 loudness) go to AURALITH-AUDIO-001 / audio-dsp-engineer with the pair number. Never commit copyrighted audio.

## 4. Limits and what is BLOCKED

- **Synthetic signals are not music.** They have no harmonic structure, vocals, room, arrangement, or genre-specific mastering expectations. A pass here shows the engine does no gross harm to test signals; it does not show it makes music sound better.
- **Real-music evidence is BLOCKED (AURALITH-QA-001, P0).** The corpus directory is absent; licensed mixes are required. Genre consistency, vocal handling, album consistency and real transient/groove behaviour cannot be assessed.
- **Human listening is PENDING for every case.** No person has heard any of these masters in this review.
- Results are provisional until the code-hash mismatch (section 0) is resolved.

## 5. Findings for the record (not filed; `issue-add` was not called)

| ID | Finding | Severity |
|---|---|---|
| N1 | c14 punch "loss" −0.355 is implausible; metric probably corrupted by the DC offset (HYPOTHESIS) | P3 |
| N2 | `engine_reported.verdict` is null for every case, so QA cannot see which guardrails or corrective renders ran | P3 |
| N3 | True-peak ceiling is −1.0 for c06/c08/c10 vs the user-facing text "delivery needs −2 dBTP or lower" (HYPOTHESIS: mismatched message) | P3 |
| N4 | `lost_drums` limit 0.12 sits at the centre of the normal punch-loss cluster (0.10–0.12), so it flags noise rather than defects (O6) | P3 |
| N5 | Rock target −17.3 LUFS vs −14.9 for another rock case (O1) | P2 (product, HYPOTHESIS) |
| N6 | Empty upload (c20c) returns HTTP 500; AURALITH-AUDIO-004 names only the garbage-bytes case | P2 |
