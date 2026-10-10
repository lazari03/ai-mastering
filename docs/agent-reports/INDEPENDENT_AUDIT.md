# Independent audit

Auditor: independent-auditor · branch `claude/agent-org-setup` · HEAD `d7346c8` (working tree differs from HEAD only in
knowledge/report files; no code) · date 2026-10-10.
Scratch copies used for re-runs (outside the repo, so no repo report/baseline file was rewritten):
`scratchpad/audit-parent` = `50956be` (parent of the fix), `scratchpad/audit-head` = `d7346c8`.

---

## 1. AURALITH-AUDIO-004: undecodable input returns 500 instead of 400 → **APPROVED**

Chain: H-0001 (QA, INFO) → H-0003 (DSP, READY_FOR_QA, fix `c4d9727`) → H-0005 (QA, READY_FOR_AUDIT).

### Change (`git show c4d9727`)
`backend/ai_mastering/audio_utils.py` `_load_audio`: the librosa fallback that runs after `sf.read` fails now catches
`audioread.exceptions.DecodeError` (`NoBackendError` is a subclass) and `EOFError`, and re-raises them as the engine's
`InvalidAudioError`. It uses a lazy import to avoid the `quality_control` ↔ `audio_utils` import cycle. Plus 3 tests in
`backend/tests/test_input_limits.py`. Between parent and HEAD, the only diff under `backend/` is these 2 files.

- **Root cause explained by the change:** yes. Each step of the chain in AUDIO_DSP_REPORT §3 checks out against the code.
  `.wav` skips the ffmpeg path, so it goes to `_load_audio`. `sf.read` fails, the librosa fallback raises a raw audioread
  exception, `render_staged_job` turns that into a generic 500 (`mastering_service.py:525`), and the route maps it to
  `render_failed` (`routes/mastering.py:300`). `InvalidAudioError` was already mapped to 400 (service L520-524) and to
  `invalid_audio` (route L300).
- **Smallest correct change:** yes. The catch is narrower than the report's proposed `except Exception`, so real engine bugs
  inside librosa still surface as 500. One loader covers master input, reference, `/analyze` (`mastering.py:64`) and stems.
- **Integration points:** the `X-Error-Code: invalid_audio` header is emitted (verified live, below). The i18n key
  `masterError.invalid_audio` exists in en and sq (`frontend/src/lib/i18n.js:1457`). On any Python failure the Node gateway
  refunds the reservation (`masteringRoutes.js:1141` `refundWithRetry`). That was checked by reading the code only;
  running it is BLOCKED (no Node/Firebase stack), as QA states.
- **No weakened tests or guardrails:** confirmed. The fix only adds tests.

### Re-run evidence (auditor's own runs)
| Check | Command | Result |
|---|---|---|
| Regression tests fail without the fix | `audit-parent` (50956be) + HEAD's `tests/test_input_limits.py`: `pytest -q tests/test_input_limits.py` | **3 failed / 9 passed**, each failing on the real defect (2× `audioread.exceptions.NoBackendError`, 1× `EOFError`), not on an import or collection error |
| Tests pass with the fix | HEAD: same command | **12 passed** |
| API-level, parent | `audit-parent`: `python -m benchmark.api_qa --cases c20a_garbage,c20c_empty --force --no-endpoints` | both **FAIL, HTTP 500** |
| API-level, HEAD | `audit-head`: `python -m benchmark.api_qa --cases c20a_garbage,c20b_truncated,c20c_empty --force --no-endpoints` | all **PASS, HTTP 400**; input hashes identical to the recorded ones (`c20a` `bc3425567288635c`); code hash `8b99ad632fedec92` reproduces the recorded one |
| Error code + no leftover files | uvicorn `benchmark.qa_app` on HEAD, `curl -F file=@random64k.wav` and `@empty.wav` to `/api/master` | `400`, `x-error-code: invalid_audio`, detail "could not be decoded as audio"; upload/output dirs empty afterwards |
| Full suite at HEAD | `audit-head/backend`: `pytest -q -x tests` | see §4 |

The QA claims in QA_REPORT.md "Verification" match my re-runs.

### Residual risks (non-blocking)
- R1 (Low): the ffmpeg path still returns 500 for a corrupt `.mp3`/`.m4a`. This is tracked as AURALITH-BACKEND-006, so it is not part of this fix.
- R2 (Low): `NoBackendError` is also what audioread raises when the host has **no** decoding backend at all. On a
  misconfigured host, a valid but unusual file that libsndfile cannot read would now be blamed on the user (400) instead of
  the server (500). The production image installs ffmpeg and libsndfile (`backend/Dockerfile:7-11`), so this is acceptable.
- R3 (Low): the DSP report proposed a route-level pytest (`test_master_route_jobs.py`: 400 + `invalid_audio` + job state
  `failed`), but it was not added. Route behaviour is covered only by api_qa, and api_qa's refusal rule does not check the
  error code (finding Q3). I verified the code manually above.

### Protocol slip: H-0001 `files_changed`
H-0001 (QA, status INFO) lists `backend/ai_mastering/audio_utils.py` under `files_changed`, although QA changed nothing.
This does not affect the verdict. The file is where the fix was meant to go, the real change set is recorded correctly in
H-0003 and in commit `c4d9727`, and no reviewer depended on H-0001's file list. It does leave a misleading audit trail
(it reads as if QA edited product code). The root cause is that `kb.py handoff-add --files` is free text that nothing
validates (finding Q8). Severity: Low (record hygiene).

**Verdict: APPROVED.** Next: technical-lead (may resolve with `--qa` from H-0005 and `--audit APPROVED`).

---

## 2. AURALITH-BACKEND-001: concurrency cap counts jobs, not memory (A12) → **APPROVED** (resolved at c88bc69)

A12 (`docs/audits/AURALITH_AUDIT.md:189`) found that `/master` used `_master_slots`, a count-only semaphore of 3,
regardless of track length. Verified from the code at HEAD:

- `_master_slots` and any `Semaphore` are gone from `backend/app`. `grep -rn "_master_slots\|Semaphore" backend/app` finds nothing.
- `app/core/job_runner.py:140-213` `ResourceGovernor`. `_fits` (L168-173) admits a job only when **reserved estimated MB + this
  job's MB ≤ budget**, and also enforces the job-count cap and the separate stem cap. A job that cannot fit at all gets a 413
  (L180). Waiting uses a bounded FIFO queue with a bounded wait time (L189-206). The reservation is released in `finally` (L210-213).
- `CostModel.estimate_mb` (L105-115) scales with duration × sample-rate ratio, plus extra for stems and for a reference track.
  The budget comes from `resolve_memory_budget_mb` (L77-91): the explicit setting first, then cgroup × 0.75, then host × 0.5.
- Wiring: `routes/mastering.py:43-51` (budget, cost model, governor), L271 (estimate from the staged header duration and rate),
  L283 (`with governor.admit(...)` wraps `run_in_worker`). These match the line numbers cited in the issue history.
  `git diff c88bc69 HEAD -- app/core/job_runner.py app/api/routes/mastering.py app/core/config.py` is empty.
- Tests: `backend/tests/test_job_runner.py` covers the budget: long jobs wait instead of overcommitting
  (`peak <= budget`), oversize jobs are refused, the stem cap is separate, plus the queue bound, cancellation and budget
  resolution. These pass inside the full suite (§4).

Residual (non-blocking, Low): when neither `sf.info` nor ffprobe can read the duration, `estimate_mb` assumes 1 minute
(`max(duration, 1.0)/60`). The same file also skips the duration limit, so an unprobeable but long upload is under-reserved.
In practice that kind of file usually fails to decode. Recommend that the backend owner file it as a P3 follow-up, not as
a reopen of A12. This audit covers only A12's scope, which is `/master` admission. Other routes were not assessed here.

**Verdict: APPROVED.** The A12 claim is resolved at c88bc69. Next: technical-lead (move to RESOLVED).

---

## 3. QA lab + kb.py review (written by technical-lead, never independently reviewed)

Scope: `backend/benchmark/api_qa.py`, `qa_corpus.py`, `qa_app.py`, `.claude/knowledge/kb.py`.

**Does api_qa exercise the production route and worker path?** Yes, for the cases it sends. `qa_app.py` mounts the same
`health` and `mastering` routers as `app/main.py`. It leaves out only CORS, the storage-cleanup task and the chords router.
`api_qa.start_server` runs a real uvicorn, and `/master` really goes through `stage_mastering_request` → `governor.admit` →
`run_in_worker`. My `curl` runs confirmed this end to end. Coverage limits are listed in Q7.

**Pass/fail rules are only existing limits?** Mostly. The hard checks are the true-peak guardrail (`GuardrailConfig`), the
±1.5 LU loudness tolerance, and integrity checks. `benchmark.metrics` failures are reported only as anomalies. The weak
points are the *refusal* and *endpoint* rules (Q1, Q3).

**Can a failure be hidden?** Yes, in the ways listed below.

| # | Sev | Component | Finding | Evidence | Required fix |
|---|---|---|---|---|---|
| Q1 | Medium | api_qa endpoint checks | `e_unknown_genre` ("refused cleanly") **passes on HTTP 200**: if the server accepted and mastered an unknown genre, the check would still report PASS. | `api_qa.py:294` `400 <= status < 500 or r.status_code == 200` | Remove `or r.status_code == 200`. (Also, `e_cancel_finished_idempotent` accepts 404/409 although the route returns 200 for a known job, `api_qa.py:290`. Tighten it to 200.) |
| Q2 | Medium | api_qa results / baselines | A **partial run after a code-hash change rewrites QA_REPORT.md, auralith-qa.json and TEST_BASELINES.json with only the cases just run**. Every other case disappears, including known FAILs. | Reproduced: in `audit-head`, `--cases c20a,c20b,c20c --force` on top of a results file with a different hash produced `status_counts {'PASS': 3}` and dropped c09's FAIL from the report and baseline (`api_qa.py:401,407,443-444`) | Keep cases from earlier runs, marked `STALE` (code hash mismatch) and counted as non-PASS, or refuse to write the report and baseline on a partial run when the hash differs |
| Q3 | Medium | api_qa refusal rule | `expect=refuse` / `master_or_refuse` passes on **any 4xx with a detail**, so 409 duplicate_job, 413 or 499 all count. The refusal reason is not checked, so a guardrail refusal (c13: "No mastering candidate passed final verification") is indistinguishable from an input refusal. A 503 overload makes the refusal-expected cases FAIL, but a 413 or 409 makes them PASS. The existing contract, the `X-Error-Code` header, is not recorded at all. | `api_qa.py:195-197` | Record `X-Error-Code`. For `refuse` cases, require status 400 and code `invalid_audio` (or the case's declared code). For `master_or_refuse`, list the accepted refusal codes per case |
| Q4 | Medium | cache key (code hash + input hash) | The cache does not invalidate everything it should. (a) `kb.codehash` excludes `benchmark/api_qa.py` and `qa_app.py`, so a change to the pass/fail rules or the app mount reuses verdicts judged under the old rules. (b) `qa_corpus.input_hash` excludes `case.expect`, so changing a case's expectation reuses the stale verdict. This happened with f04 and was fixed by deleting cached cases by hand (commit 677d56a). (c) `input_hash` hashes only the *name* in `form["_reference"]`, not the reference audio's content. | `kb.py:41-45`; `qa_corpus.py:140-152`; checked: `input_hash(f04) == input_hash(replace(f04, expect='master'))` → True | Add `backend/benchmark/api_qa.py` and `qa_app.py` to `DSP_HASH_GLOBS`, or put a separate harness hash into the cache key. Add `case.expect` and the rendered reference bytes to `input_hash` |
| Q5 | Medium | api_qa endpoints | `--no-endpoints` **copies endpoint results from earlier runs into the new result**, stamped with the new commit and code hash. These may come from different code, and they still decide the exit code. | Reproduced: the `audit-head` result (commit d7346c8, hash 8b99…) contains 17 endpoint results produced at 69e7a60 / hash e584…; `api_qa.py:441` `endpoints or prev.get("endpoints", [])` | Carry them forward only when `prev.code_hash == code_hash`. Otherwise record `[]` and mark them as not run |
| Q6 | Low | api_qa loudness check | The loudness check is **silently skipped** when `_target_lufs` finds none of its 4 candidate keys, so a renamed response field turns the hard check into a pass. | `api_qa.py:165-170, 233-234` | For `expect=master`, record `loudness_within_tolerance_of_requested_target = False` (or ERROR) when the target is missing |
| Q7 | Low | claim accuracy / coverage | The claim "same processing path customers hit" holds only for `.wav` uploads on the adaptive engine. Every upload is named `{case}.wav` (`api_qa.py:177`), so the ffmpeg decode path that the gateway uses for real `.mp3`/`.m4a` names (`masteringService.js:436` forwards `originalname`) never runs, which is how BACKEND-006 was missed. No case sends `full_preset_json` or `mix_preset`, so the preset engine (`render_preset_master`) is never exercised. | `api_qa.py:177`; `qa_corpus.py` (no preset or compressed cases) | State these gaps in the report header next to "Not in the loop". Adding cases is optional and not required |
| Q8 | Low | kb.py protocol integrity | (a) The `issue-resolve` Definition-of-Done gate checks only that `--qa` and `--audit` are non-empty, so `--audit REJECTED` resolves an issue. (b) `handoff-add --files` is free text that nothing validates (this enabled the H-0001 slip). (c) Handoff IDs are `len+1`, so parallel worktree writes can collide when merged. (d) `issue-update --set` can overwrite any field, including `history`, contradicting "append-only". (e) The docstring says the code hash covers "pinned deps", but it hashes only `requirements-test.txt`, not `requirements.txt`. | `kb.py:165-166, 180-190, 151-153, 16 vs 44` | (a) Require `--audit APPROVED` (or check that an APPROVED independent-auditor handoff exists for the task). (d) Refuse `--set` on `id`, `status` and `history`. (b), (c) and (e) are documentation-only: note them in the retrieval workflow |

No finding shows a recorded result that is currently wrong. My spot re-runs reproduce the recorded c20 statuses, input
hashes and code hash. The findings are about ways a future failure could be hidden or a stale verdict reused. Q1-Q5 should
be fixed before the QA lab is used as a release gate.

---

## 4. Full suite (auditor re-run)
`cd scratchpad/audit-head/backend && pytest -q -p no:cacheprovider -x tests` → PENDING_RESULT

---

## Files read / commands
Listed in the auditor's final JSON report to technical-lead.
