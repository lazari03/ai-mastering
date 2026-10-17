# Skills, Agents & Tooling Inventory

Audit date 2026-10-15 · base commit `e441297` · branch `claude/platform-audit-2026-10` · owner: tooling-manager.
Scope: project `.claude/`, user `~/.claude/` (cloud session), plugin skills/agents exposed to this session, MCP servers, hooks, CLI tools.

## Project agents (`.claude/agents/`) — 17
| Agent | Origin | Role # (audit brief) | Status |
|---|---|---|---|
| technical-lead | existing | 01 Principal/Architect | reuse as-is |
| backend-engineer | existing | 02 Backend (Python + Node) | reuse as-is |
| frontend-engineer | existing | 03 React/Next | reuse as-is |
| security-engineer | existing | 04 AppSec | reuse as-is |
| devops-engineer | existing | 05 DevOps/SRE | reuse as-is |
| qa-automation-engineer | existing | 06 QA | reuse as-is |
| audio-dsp-engineer, mastering-engineer | existing | 07 Audio/DSP (+ musical evaluation) | reuse as-is |
| **database-engineer** | new 2026-10-15 | 08 Database (Firestore + SQLite) | findings → backend-engineer |
| **seo-analytics-engineer** | new | 09 SEO/Analytics | wraps searchfit-seo + product-tracking skills |
| **growth-marketer** | new | 10 Growth | wraps marketing plugin skills; docs only |
| **payments-engineer** | new | 11 Payments | reviewer; code owner stays backend-engineer |
| **performance-engineer** | new | 12 Performance/Scalability | benchmarks + capacity model |
| **ux-designer** | new | 13 UI/UX | findings/specs only |
| product-specialist + independent-auditor | existing | 14 PM / Release auditor | reuse as-is (split: value vs. verification) |
| **tooling-manager** | new | 15 Skills/Tooling | owns this file |

Overlap control: payments-engineer and database-engineer do **not** write product code (single-writer rule in
`.claude/workflows/agent-coordination.md`). New agent types become selectable in a *new* Claude Code session; in the
creating session they were run through the general-purpose agent with their `.md` as instructions.

## Shared knowledge & workflows (reuse, do not duplicate)
`.claude/knowledge/` (INDEX.md entry point, `kb.py` CLI: issues/handoffs/baselines/staleness), `.claude/workflows/`
(agent-coordination, knowledge-retrieval, release-validation). The audit brief's proposed `.claude/project-knowledge/` was
**not created** — it would duplicate this KB.

## Skills available to this session
| Source | Skills | Use here |
|---|---|---|
| searchfit-seo plugin | seo-audit, technical-seo, schema-markup, broken-links, internal-linking, content-strategy, content-brief, keyword-clustering, content-translation, ai-visibility, on-page-seo (+ agents seo-auditor, competitor-analyzer, content-strategist) | seo-analytics-engineer |
| marketing plugin | campaign-plan, competitive-brief, content-creation, draft-content, email-sequence, performance-report, seo-audit, brand-review | growth-marketer (`marketing:seo-audit` duplicates `searchfit-seo:seo-audit` — prefer searchfit) |
| engineering plugin | architecture, code-review, debug, deploy-checklist, documentation, incident-response, standup, system-design, tech-debt, testing-strategy | technical-lead, devops, QA |
| product-tracking-skills | audit-current-tracking, design-tracking-plan, implementation guide, instrument-new-feature, model-product, business-case (+ tracking-watchdog agent) | seo-analytics-engineer (funnel gaps ANALYTICS-001/002) |
| built-ins | code-review, security-review, simplify, run, init, session-start-hook | all |
| anthropic-skills | pdf/docx/xlsx/pptx, solo-founder, launch-strategy, content-strategy, skill-creator | ad hoc |

## Drift / problems found
- `skills-lock.json` (repo root) pins 15 skills from `Leonxlnx/taste-skill` (design-taste variants, brandkit, image-to-code, …)
  but **none are installed** in `.claude/skills/` (directory absent). Either install deliberately after review or delete the lock
  file. Not reinstalled: third-party, unreviewed. Recommendation: delete unless the frontend-engineer actually uses them.
- No `CLAUDE.md` anywhere; `.claude/knowledge/INDEX.md` plays that role. Optional: a 5-line `CLAUDE.md` pointing to INDEX.md so
  ordinary (non-agent) sessions also find it.
- No project hooks/settings (`.claude/settings.json` absent). A SessionStart hook that creates the Python 3.12 venv and runs
  `npm ci` would remove the manual setup in INDEX.md "Local environment notes" (skill: `session-start-hook`).
- MCP: no project `.mcp.json`. Session-level connectors exist (GitHub, Notion, Figma, Canva, …); analytics connectors
  (Amplitude, Ahrefs, Similarweb, Supermetrics) **require authorization** and were not used → traffic data MISSING.
- The KB had been last validated at `c88bc69`; 8 components were stale (`kb.py stale`). Re-validated items are noted in issues.

## CLI tools
| Tool | State | Used |
|---|---|---|
| Python 3.12, uv, ruff, Node 22/npm | preinstalled | yes |
| pytest, pip-audit, bandit | installed into local venv `/home/user/venv-auralith` (not global, not committed) | yes |
| npm audit | built-in | yes |
| Playwright + Chromium | preinstalled (`/opt/pw-browsers`) | not this session |
| gitleaks, semgrep, trivy, osv-scanner | **not installed** | recommended for CI (free): gitleaks + osv-scanner first (smallest footprint, highest value for a public repo) |
| ffmpeg | preinstalled | via tests |

No global packages were installed and no model/billing settings changed.
