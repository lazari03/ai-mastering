# Audio validation

**Status: real-music quality validation is PENDING.** No licensed real-mix
corpus and no blind listening panel existed during this work. So **nothing in this
repository is evidence that Auralith masters sound better than the mix, or
as good as alternatives.** This document records what *is* validated, what is
not, and the exact workflow that will close the gap.

## 1. Validated (executed in this session)

| Check | Result |
|---|---|
| Synthetic regression (21 tracks, 11 genres, `benchmark/baselines/synthetic.json`) | **0 drift** after all changes in this pass. DSP was untouched; thresholds unchanged |
| Python suite (includes DSP guardrails, QC, engines, stem pipeline with mocked separation) | **229 passed** |
| CI on GitHub, run #200 (previous commit) | All jobs green, including Python tests and synthetic regression (0 drift on GitHub's runner) |
| Real Demucs on real music (2 CC tracks, 2 models) | Separation runs; cost measured (RESOURCE_BENCHMARKS.md) |
| Full stem pipeline, real Demucs (33.6 s demo) | `stem_separation: applied (htdemucs_ft)`; master delivered; −15.9 → −10.1 LUFS; vocal judged already in place and left unchanged |

The synthetic regression guards against **change**, not for **quality**. It
proves a code change didn't move the output. It cannot prove the output is good.

## 2. Not validated

* Listening quality on real mixes, against the raw mix, a human engineer or another service.
* Separation quality (vocal bleed, artefacts). No listening was done on the stems.
* Whether the calibration default (`MASTERING_CALIBRATION=balanced`) is the
  one listeners prefer.
* Professional vs Standard audibility (measured as near-identical; see PROFESSIONAL_ROADMAP.md).

## 3. Workflow to validate (all tooling exists and is tested)

1. **Corpus** (licensed only; never committed): 15–20 mixes covering the genres in
   `benchmark/__init__.py`, with `meta.json` carrying the `license` field. Add `refs/human.wav` and
   competitor masters only where you hold the rights to them.
2. **Render the blind set**: `python -m benchmark.run_benchmark --corpus <dir>`. The output is
   loudness-matched with gain only and given neutral letters; `listening_key.json` is kept away from listeners.
3. **Ballots**: `python -m benchmark.blind_ab template <results> --listener <id>`
   for each listener. They rank each track best-first and add notes on drums, bass, highs and pumping.
4. **Tally**: `python -m benchmark.blind_ab tally <results>` writes
   `preference.json` and `preference.md`. These contain mean rank, first places, and Auralith-vs-each-version wins/losses with an
   exact two-sided sign test. **Status stays `pending` below 3 listeners or 15
   ranked tracks**, and the report then says no quality claim may be made.
   Malformed ballots (missing or duplicate letters) are rejected, not counted.
   Tests: `tests/test_blind_ab.py` (5).
5. **Release gate**: approve the corpus baseline. After that, `release-benchmark.yml` (manual,
   self-hosted runner with the corpus) fails on drift, and fails visibly when the corpus or baseline is missing.

Claims allowed after step 4 completes: only what the sign test supports, per
comparison. For example, "preferred over the raw mix in N of M blind judgements (p = …)".

## 4. User-facing audio messages fixed in this pass

* Quiet but non-silent audio (peak ≥ 1e-6, RMS below −70 dBFS) was rejected with
  "Audio is digital silence". It is now rejected as "far too quiet to master (overall level X dBFS RMS…)". The **threshold is unchanged**; only the message changed.
  Test: `test_very_quiet_audio_is_not_called_digital_silence`.
* Input-validation findings that were computed but never shown are now source
  warnings: DC offset removed, and L/R imbalance over 6 dB (the existing `CHANNEL_IMBALANCE_WARN_DB`).
* Every engine warning now has a stable code and params
  (`processing_applied.source_warning_codes`), and the UI localizes it in English and Albanian. The engine's
  improvement-check *reasons* are measurement prose and stay in English under a
  localized prefix (remaining gap).
