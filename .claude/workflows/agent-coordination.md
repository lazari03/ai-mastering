# Agent coordination protocol

Owner: technical-lead. Applies to all 10 agents in `.claude/agents/`.

## Roster and codebase ownership (one writer per path)
| Agent | Writes (implementation ownership) | Report |
|---|---|---|
| technical-lead | `.claude/knowledge/*` (organization), `docs/agent-reports/MASTER_STATUS.md` — **no product code** | MASTER_STATUS.md |
| audio-dsp-engineer | `backend/ai_mastering/**`, `backend/params.py`, `backend/adaptive_mastering.py`, `backend/mixing_presets.json`, `backend/benchmark/baselines/*` (with review) | AUDIO_DSP_REPORT.md |
| mastering-engineer | `backend/benchmark/blind_ab.py`, `calibration_ab.py`, listening session files — **no DSP code** | MASTERING_QUALITY_REPORT.md |
| backend-engineer | `backend/app/**`, `backend-node/src/**` (excl. middleware/auth.js → shared with security) | BACKEND_REPORT.md |
| frontend-engineer | `frontend/src/**` (excl. `lib/pricing.js` → product approval) | FRONTEND_REPORT.md |
| qa-automation-engineer | `backend/tests/**`, `backend-node/src/**/__tests__/**`, `backend/benchmark/{api_qa,qa_corpus,regression,synthetic_corpus,metrics}.py`, `test-results/**` — **never DSP/product code** | QA_REPORT.md |
| security-engineer | `backend-node/src/middleware/**` (with backend review); findings only elsewhere | SECURITY_REPORT.md |
| devops-engineer | `docker-compose.yml`, `*/Dockerfile`, `Caddyfile`, `Makefile`, `.github/workflows/**` | DEVOPS_REPORT.md |
| product-specialist | `frontend/src/lib/pricing.js` copy, `frontend/src/content/**` copy — prices only with product-owner approval | PRODUCT_REPORT.md |
| independent-auditor | **read-only** on code; writes only its report and verdicts | INDEPENDENT_AUDIT.md |
Reports live in `docs/agent-reports/`. A report is the long-form evidence; the knowledge base stores the pointer.

## Lifecycle
1. **Discovery** (read-only): lead delegates domain audits. Each agent first runs
   `kb.py issues --component <its components>` and skips anything already documented unless it has new evidence.
2. **Consolidation**: lead dedupes, assigns `AURALITH-<DOMAIN>-NNN` via `kb.py issue-add`, sets severity.
3. **Assignment**: one owner + reviewers per issue (default chains below). Recorded in the issue.
4. **Implementation**: owner → root cause → regression test (fails first) → smallest fix → targeted tests →
   `kb.py issue-update <id> --status READY_FOR_QA` + `kb.py handoff-add ... --next qa-automation-engineer`.
5. **Validation**: QA reproduces the original defect on the parent commit, verifies the fix, hands off `READY_FOR_AUDIT`.
6. **Audit**: auditor inspects diff + evidence independently → `APPROVED` or `REJECTED` (reasons + required fix). Rejected → back to owner.
7. **Close**: lead runs `kb.py issue-resolve <id> --qa <verdict> --audit <verdict> ...` (the CLI refuses without both) and updates MASTER_STATUS.md.

Default review chains:
- DSP: audio-dsp-engineer → mastering-engineer (domain) → qa → independent-auditor
- Backend/billing: backend-engineer → security-engineer → qa (concurrency + refund tests) → independent-auditor
- Frontend: frontend-engineer → qa (e2e workflow) → independent-auditor
- Infra: devops-engineer → security-engineer → qa → independent-auditor

## Handoff format (only this goes between agents)
```json
{"task_id":"AURALITH-AUDIO-001","agent":"audio-dsp-engineer","status":"READY_FOR_QA",
 "summary":"<=300 chars","files_changed":[],"tests_executed":[],"results":[],"risks":[],
 "evidence":"path/to/detail","next_agent":"qa-automation-engineer"}
```
Write with `kb.py handoff-add`; read with `kb.py handoffs --to <me>`. No pasted analysis histories.

## Concurrency rules
- Parallel agents only for independent work on disjoint path sets (table above). Otherwise sequential.
- Implementation work by two agents at once uses `isolation: worktree` or disjoint ownership.
- Never claim parallel execution unless it happened.

## Token budget rules (all agents)
Do not rescan the repo; start at `INDEX.md`. Load only needed Level-2 entries; read source only to implement/verify.
Reuse valid test results (`TEST_BASELINES.json`, hash-checked). Use scripts, not LLM reasoning, for measurement.
Keep handoffs short; detail lives in files. One agent per trivial task. No identical broad audits by several agents.
No full audio corpus after UI-only changes. Expensive reasoning is reserved for DSP design, architecture, complex
regressions, security-critical changes and release reviews (model choice is set per agent in frontmatter).

## Stop conditions
Stop when all actionable issues are resolved, tests pass, or the remainder needs external input
(listening panel, licensed audio, credentials, product decisions). Never loop autonomously. Never push or deploy without approval.
