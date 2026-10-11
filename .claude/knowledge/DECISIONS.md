# Engineering decisions (Level 2)

Append-only. Format: ID · date · decision · rationale · alternatives · components · commits/sources.
Before re-opening a decision, cite new evidence. Owner: technical-lead; auditor verifies.

## D-001 · 2026-10-10 · File-based shared knowledge, not Graphify
- **Decision:** Shared knowledge lives in `.claude/knowledge/` (Markdown + JSON) with a stdlib-only CLI `kb.py` for focused queries, staleness and handoffs.
- **Rationale:** Graphify is not installed (`pip show graphify` → not found; only a stale `graphify-out/` gitignore line). Installing it adds a dependency, an index to maintain, and possibly embedding costs, for a ~25k-line repo whose component graph fits in one JSON file (`COMPONENTS.json`). No measurement exists showing it would cut context use.
- **Alternatives:** Graphify semantic index (rejected for now; revisit if the knowledge base outgrows grep + kb.py, measured by retrieval misses in handoffs); per-agent `memory:` frontmatter (rejected: creates private copies, which the single-source-of-truth rule forbids).
- **Components:** all · **Source:** this session.

## D-002 · 2026-10-10 · Agents are versioned; .gitignore narrowed
- **Decision:** `.claude/agents|knowledge|workflows` and `docs/agent-reports/*.md` are tracked; the rest of `.claude/` stays ignored.
- **Rationale:** `.gitignore` ignored `.claude/` and `*.md`, so the organization would silently never persist across clones.

## D-003 · 2026-10-10 · API-level QA lab reuses the benchmark package
- **Decision:** The QA harness (`backend/benchmark/api_qa.py`, `qa_corpus.py`) submits audio over HTTP to the real FastAPI `/master` route (same `run_in_worker` path customers hit through Node) and measures with `benchmark.metrics.compare` + pyloudnorm. Synthetic fixtures come from `tests/synthetic.make_mix`.
- **Rationale:** Reuse existing calibrated fixtures and loudness-matched metrics; avoid a second framework. The spec's `tests/audio_corpus/` layout is mapped onto `backend/benchmark/` (existing home of corpora).
- **Limitation:** Node gateway (auth, billing) is not in the loop locally (needs Firebase credentials); app mounts `mastering_router` directly because `app.main` imports essentia via the chords router.

## D-004 · 2026-10-10 · No numeric thresholds invented for QA
- **Decision:** QA pass/fail uses only existing limits (`GuardrailConfig`, `benchmark.metrics`, QC fail lines, regression TOLERANCES). Anything else is reported as a measurement, not a verdict.

## D-005 · 2026-10-10 · Native agent registration requires a session restart
- **Decision:** In the session that created `.claude/agents/`, specialist work runs via general-purpose subagents instructed to load the agent definition file verbatim. Native `subagent_type` use starts next session.
- **Rationale:** Claude Code watches only agent directories that existed at session start (docs: code.claude.com/docs/en/sub-agents).

## D-006 · 2026-10-10 · Local Python must be 3.12
- **Decision:** Use a Python 3.12 venv locally (matches CI and `backend/Dockerfile`).
- **Rationale:** `pedalboard==0.9.25` raises SIGILL on import under Python 3.13 in this container (exit 132 for the whole pytest run). Under 3.12: 229 passed, synthetic drift 0.

## D-007 · 2026-10-11 · True-peak ceiling follows the planned loudness (AURALITH-AUDIO-008)
- **Decision:** `planning/plan.py:apply_delivery_ceiling` sets the limiter ceiling to -1 dBTP whenever the plan's target is at or below -14 LUFS; above it, the context ceiling (-2 dBTP for genres whose window reaches above -14) stays. Re-applied after the user loudness tweak and after every backoff loudness reduction. The target is not recomputed, so the freed 1 dB becomes less limiting, not more loudness. Relax-only: never tightens a -1 dBTP context.
- **Rationale:** Spotify's -2 dBTP applies only to masters louder than -14 LUFS. Measured synthetic rows: rock_transient(_pro) and dense_drums_edm(_pro) limiter max GR -1.0 dB, transient retention +0.02 to +0.04, PLR +0.9 dB, same LUFS (±0.1). Real tracks unaffected (both planned above -14).
- **Alternatives:** recompute the target with the extra headroom (rejected: spends the gain on loudness, against the priority order).
- **Components:** dsp.planning, dsp.evaluation (backoff) · **Source:** docs/agent-reports/DSP_FIXES.md C1.

## D-008 · 2026-10-11 · Transient checks use relative loss (AURALITH-AUDIO-001)
- **Decision:** Both transient checks (evaluator `allowed_loss = 0.22 − 0.15·priority`, guardrail `max_transient_loss = 0.12`) compare the documented FRACTION with the relative change `(master − source)/source` at matched loudness (0 when source punch < 0.15). Thresholds unchanged. `evaluation.transients` gains `relative_delta`; `delta` (absolute) is kept for API compatibility.
- **Rationale:** The absolute delta made the checks about 2× looser than documented and disagreed with `benchmark.metrics`. Synthetic rows that now fail first and are delivered by the existing corrective ladder (−1.5 LU nominal relief): short_3s_pop (retention 0.844→0.925), one_dead_channel_rnb (0.871→0.940), dark_rock (0.910→0.972); boomy_extreme_trap's existing corrective now also relieves the limiter (0.936→1.031, −2.2 LU, limiter GR 5.7→2.95). Each costs 1.3–2.2 LU of loudness and one extra render; loudness shortfall is reported (`loudness_below_request`). Real gate: 0 drift (Dune pop margin 0.35 pt).
- **Alternatives:** raise the thresholds to keep current behaviour (rejected: weakens a guardrail).
- **Components:** dsp.evaluation · **Source:** docs/agent-reports/DSP_FIXES.md C2.

## D-009 · 2026-10-11 · No automatic boost for a deficit entirely below 40 Hz (AURALITH-AUDIO-010)
- **Decision:** `_plan_eq` rejects a non-reference tonal deficit whose bands all end at or below `config.EQ_MIN_DEFICIT_BOOST_HZ` (40 Hz), recording "sub-40 Hz deficit: commonly an intentional high-pass".
- **Rationale:** pop-before got a 35 Hz +1.67 dB bell from a 20-30 Hz-only deficit with no measurable benefit (unnecessary move; the evaluator itself ignores < 25 Hz). Synthetic drift 0, real drift 0 (pop row within tolerance).
- **Components:** dsp.planning · **Source:** docs/agent-reports/DSP_FIXES.md C3.
