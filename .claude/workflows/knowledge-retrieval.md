# Knowledge retrieval protocol

All commands run from the repo root. Set `KB_AGENT=<your-agent-name>` so the access log attributes your queries.

## Level 1 — always (≈1 file)
1. `.claude/knowledge/INDEX.md` (architecture summary, constraints, index).
2. Your task (issue id or request).
3. `python3 .claude/knowledge/kb.py issues --component <your component>` — known issues for your area.

## Level 2 — only what the task needs
| Need | Command / file |
|---|---|
| Paths, tests, owner of a component; changes since last validation | `kb.py component <id>` |
| A specific issue with history | `kb.py issue <ID>` |
| Work handed to you | `kb.py handoffs --to <me>` / `--task <ID>` |
| Last verified audio results (no re-run if hashes match) | `kb.py baseline [--case <id>]` + `kb.py codehash` |
| Domain rules | one of DSP_KNOWLEDGE.md / BILLING_RULES.md / PRODUCT_RULES.md / ARCHITECTURE.md (use Grep for a section, not the whole file, when you need one fact) |
| Why something is the way it is | Grep `DECISIONS.md` for the component |
Role defaults: DSP → DSP_KNOWLEDGE + TEST_BASELINES + `issues --component dsp`; frontend → ARCHITECTURE (API) + PRODUCT_RULES (i18n);
billing → BILLING_RULES + `issues --component billing`; security → ARCHITECTURE + BILLING_RULES invariants.

## Level 3 — source
Read source files only to implement or verify. Start from the paths `kb.py component` returns.

## Validity check before relying on any entry
1. Has a `source` / `validated_commit`? If not, treat as a hypothesis.
2. `kb.py stale` / `kb.py component <id>` → if its paths changed since `validated_commit`, the entry is **STALE**: verify against code, then update it (or mark `STALE` in a handoff).
3. Newer test results (`TEST_BASELINES.json`, `test-results/auralith-qa.json`) supersede older prose.
4. Audio results are reusable only if `code_hash == kb.py codehash` and the input hash matches.

## Writing knowledge
- Update only the entry you touched; never rewrite a file wholesale.
- Issues/handoffs: always through `kb.py` (append-only history, ID allocation, DoD enforcement).
- Markdown entries: edit the one section; bump its `validated_commit`; cite the source (file:line, test, report).
- Decisions: append a `D-NNN` block to DECISIONS.md.
- The independent-auditor verifies significant updates (new invariants, threshold/baseline changes, resolved P0/P1).
- Large evidence → `docs/agent-reports/` or `test-results/`; the knowledge base stores only the pointer.

## Lead's periodic hygiene (per release candidate or every ~10 resolved issues)
`kb.py stale` · duplicate issue scan (`kb.py issues --grep`) · contradictory DECISIONS · issues in READY_* with no handoff · resolved issues lacking regression tests.
