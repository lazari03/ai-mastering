# Agent system validation

Owner: technical-lead · 2026-10-10. What was actually executed to prove the organization and its shared knowledge work.
All token figures are the harness-reported `subagent_tokens` per invocation; nothing below is estimated.

## 1. Agent registration
- 10 definitions in `.claude/agents/` (frontmatter fields verified against https://code.claude.com/docs/en/sub-agents).
- A fresh `claude -p` process lists all 10 → **native recognition verified**.
- This session could not use them as native `subagent_type`s: Claude Code watches only agent directories that existed at session start
  (`Agent type 'security-engineer' not found`). Every invocation below used a general-purpose subagent that loaded its definition file
  verbatim and ran on the definition's `model` (opus/sonnet). From the next session they are native. (DECISIONS D-005)

## 2. Cross-agent knowledge scenario (AURALITH-AUDIO-004, undecodable upload → HTTP 500)
| Step | Agent (model) | Context given by the lead | What it retrieved (kb.py / files) | Outcome |
|---|---|---|---|---|
| 1–2 Discover + record | qa-automation-engineer (sonnet) | "test case c20a_garbage is failing" | `issues --grep c20a`, `issues --grep garbage` (dedupe) · INDEX.md, KNOWN_ISSUES `_schema`, auralith-qa.json, AUDIO_DSP_REPORT §3 (5 files) | Reproduced via API (HTTP 500); `issue-add` → AURALITH-AUDIO-004; handoff H-0001 → DSP |
| 3–4 Retrieve + fix | audio-dsp-engineer (opus, worktree) | **only the issue id** | `issue AURALITH-AUDIO-004` → `handoffs --task` → `component dsp.bus` → `component python.api` · 12 file reads, all line ranges or greps; no repository scan | Root cause in `audio_utils.py` loader; fix + 3 regression tests (fail before / pass after); pytest 231, drift 0; out-of-scope ffmpeg defect handed off (→ BACKEND-006); handoff H-0003 |
| 5–6 Verify | qa-automation-engineer (sonnet) | "process your handoff queue" | `handoffs --to qa-automation-engineer` → `issue`, `baseline`, `codehash` · 13 file reads | Parent repro 500 / HEAD 400; chose full re-run because the code hash changed; pytest 232, api_qa 33 cases; handoff H-0005 |
| 7 Audit | independent-auditor (opus) | "process your handoff queue" (+ 2 extra lead items) | `handoffs --to independent-auditor` → `issue`, `handoffs --task` · re-ran the decisive checks in a scratch worktree | APPROVED (H-0006); also reviewed BACKEND-001 (APPROVED) and the lead's QA lab (8 findings) |
| 8 Close | technical-lead | — | `kb.py issue-resolve` (refuses without QA + APPROVED audit) | AURALITH-AUDIO-004 moved to RESOLVED_ISSUES.json with full history |

Information flowed only through the knowledge base. The DSP engineer received an issue id and nothing else, and found the defect, its
evidence, and the prior root-cause analysis through four `kb.py` queries.

## 3. Independent challenge actually happened
- The mastering engineer challenged the DSP report with numbers (transient loss is common, not an edge case; Professional ≡ Standard on same audio).
- The auditor reviewed the **lead's own** QA lab and `kb.py`: 8 findings; QA fixed theirs (APPROVED); the lead's `kb.py` rework was **REJECTED**
  twice (a Definition-of-Done bypass via `issue-update --status DONE`, then denylist bypasses such as `' DONE'`/`WONTFIX`), then APPROVED once it was rebuilt as an allowlist with automated tests.
- The technical lead independently reproduced the security engineer's Critical finding before ranking it P0.

## 4. Reuse and staleness (measured)
- The mastering engineer evaluated 27 rendered cases **without re-rendering**. It also correctly refused to certify them: the recorded code hash
  no longer matched (the lead had changed the hash glob set), so it treated the numbers as provisional, as the reuse rule requires.
- QA lab cache: an unchanged re-run reused **33/33** cases in **29 s** of wall time, versus **435 s** of recorded render time. Before this worked,
  a real bug had to be found: libsndfile stamps float WAVs with a timestamped PEAK chunk, so input hashes are now taken over decoded audio.
- `kb.py stale` / `component` report component paths changed since `validated_commit`.

## 5. Token usage per invocation (measured)
| Agent | Phase | Model | Tokens | Tool uses | Wall s |
|---|---|---|---|---|---|
| devops-engineer | discovery audit | sonnet | 82,176 | 9 | 49 |
| product-specialist | discovery audit | sonnet | 81,820 | 18 | 72 |
| backend-engineer | discovery audit | sonnet | 104,753 | 16 | 126 |
| frontend-engineer | discovery audit | sonnet | 96,712 | 29 | 178 |
| security-engineer | discovery audit | opus | 120,733 | 26 | 258 |
| audio-dsp-engineer | discovery audit | opus | 122,898 | 26 | 345 |
| qa-automation-engineer | scenario 1–2 | sonnet | 64,065 | 8 | 32 |
| mastering-engineer | evaluation from recorded results | sonnet | 108,161 | 14 | 162 |
| backend-engineer | SECURITY-001/002 fix (worktree) | sonnet | 114,382 | 54 | 1,047 |
| audio-dsp-engineer | scenario 3–4 fix (worktree) | opus | 96,068 | 51 | 1,076 |
| security-engineer | review of security fix | opus | 120,662 | 25 | 240 |
| qa-automation-engineer | scenario 5–6 | sonnet | 81,374 | 26 | 1,404 |
| independent-auditor | scenario 7 + QA-lab review | opus | 160,070 | 52 | 999 |
| qa-automation-engineer | QA-006/004 fixes + full run | sonnet | 108,158 | 24 | 677 |
| independent-auditor | re-review QA-006/004/007 | opus | 100,077 | 18 | 145 |
| independent-auditor | re-review 2 QA-007 (REJECTED) | opus | 66,475 | 6 | 55 |
| independent-auditor | re-review 3 QA-007 (APPROVED) | opus | 69,890 | 7 | 55 |
| **Total (17 invocations)** | | | **1,698,474** | | |
Not included: the lead's own context, and the docs-lookup agent used at setup.

Parallelism: the six discovery audits ran concurrently (background agents launched together). The security fix and the DSP fix ran
concurrently in separate git worktrees. Everything else ran sequentially because each step depended on the previous one.

**Token savings are not claimed.** No control run (the same tasks without the knowledge base) was done, so no comparison exists. What *is*
measured: the scenario's implementer worked from a 4-query retrieval path with targeted reads, and the cache avoided 435 s of rendering.

## 6. Problems the validation surfaced (and fixed)
- Duplicate issue id (AURALITH-PRODUCT-002 allocated twice: bad seed counter) → `issue-add` now derives ids from the highest id in use.
- Handoff id collisions across worktrees → ids are max+1, and the lead re-adds worktree knowledge instead of merging JSON (documented).
- Agents in worktrees log retrieval inside their worktree → logs collected manually for this report (logged here as a limitation).
- Embargo leakage risk in a public repo → embargo rule added to INDEX.md constraint 9 and the security agent definition. Earlier pushed commits
  contain a vulnerability-class hint in issue wording; reported to the product owner.
- QA protocol slip (H-0001 listed a file as changed that was not) → `--files` now validated.

## 7. Final state
AURALITH-QA-007 (kb.py) APPROVED on the third audit round. The auditor confirmed the new guard tests (`.claude/knowledge/test_kb.py`) fail against the previous kb.py. Five issues closed through the Definition-of-Done gate this session.
