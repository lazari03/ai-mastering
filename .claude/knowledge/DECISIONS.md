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
