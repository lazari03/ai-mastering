# Professional tier: roadmap

**Status: roadmap only. No Professional feature was added in this pass.** The
hardening work (billing, cancellation, resources) came first, because a paid
feature built on a lossy job lifecycle would make that worse.

## Where Professional stands (measured, unchanged)

`ai_mastering/engines.py`: both engines make the same decisions with the
same limiter. Professional differs in one way only: it splits the
compression low band into sub (<90 Hz) and punch (90–250 Hz). This only matters when the plan compresses,
which happened on 2 of 21 synthetic tracks. On same-audio pairs the outputs are identical or within
0.1 dB (docs/audits/RELEASE_READINESS.md §5). A Studio customer pays for a difference they will
rarely hear.

Rule for everything below: **Standard is never degraded to make room**. Every
item adds a workflow on top of the shared engine, and each one ships only with its
own measurement or listening evidence.

## Priority order

| # | Feature | Why it's worth paying for | Engine change | Effort | Evidence needed before launch |
|---|---|---|---|---|---|
| 1 | **Album mastering** | A release that sits together is a real Studio need; competitors charge for it | None to the DSP. A shared target is passed into the existing planner | M | Loudness and tonal spread across an album, before and after; blind sequence listening |
| 2 | **Reference workflows** | "Make it sit like this record" is the most common pro request | Uses the existing `reference_file` matching; adds saved references and a report | S–M | Per-band distance to the reference before and after, on 10+ pairs |
| 3 | **Manual controls on the adaptive engine** | Pros want to overrule the engine, not leave it | Exposes existing plan knobs (target LUFS within range, EQ move caps, width, limiter character) as bounded overrides | M | Overrides respect every guardrail (tests); no new failure modes in the regression |
| 4 | Stem-aware mastering beyond vocals | Higher-value stem use | Separation is already paid for | L | Demucs cost: htdemucs_ft is ~2.3× realtime on 4 vCPU (RESOURCE_BENCHMARKS.md), which only works for short tracks today |

### 1. Album mastering (design)

* **Input**: 2–20 tracks, uploaded as one album job (one reservation per track, in the same
  ledger; a failed track refunds only itself).
* **Pass 1, analysis only** (cheap, no render): per-track `SourceProfile`, using the
  analysis the planner already computes. Derive one album target:
  * the median of the per-track planned LUFS, clamped to the genre and delivery range;
  * the median tonal balance across tracks, as the reference spectrum;
  * one true-peak ceiling.
* **Pass 2**: render each track with the album target as its `reference_relative_db`
  and loudness target. This is the same path a reference file takes today, so **no new DSP**. Per-track
  guardrails still apply; a track the shared target would damage keeps its
  own plan and is flagged.
* **Output**: per-track masters and an album report: LUFS spread, tonal spread, which tracks
  were held back and why.
* **Resource fit**: tracks are admitted one at a time through the existing
  `ResourceGovernor`, so an album never takes more than one job's memory.
* **Billing**: N masters. The Studio quota (50/month) covers 2–3 albums.

### 2. Reference workflows

* Saved references per user, stored as analysis only (spectrum and dynamics), not the
  audio, so a commercial reference isn't kept.
* "Closeness" report: per-band distance and crest/PLR distance from the reference, before and after.
  It is built from numbers the engine already produces (`level_diagnostics`).
* A strength control for matching. The existing matching limits are the maximum;
  the user can only ask for less.

### 3. Bounded manual controls

* Overrides go through the planner, not around it. The guardrails
  (`ai_mastering/planning`, QC, backoff) still decide whether a render is
  deliverable, and an override that fails verification falls back with a
  warning, as `transparent_fallback` does today.
* No new thresholds; overrides are clamped to existing ranges.

## What to do with the tier until #1 ships

Keep Professional's description factual (the copy already only describes the
mechanism), and sell Studio on volume plus whichever of #1–#3 lands first.
