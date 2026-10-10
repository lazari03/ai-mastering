# Release readiness v2

## Verdict

**Technically safe to deploy after review, and after CI is green on this tree.
Quality is not yet proven.** Overall: **7 / 10** (evidence below). The billing, lifecycle and resource
work moves the operational side to about 9. The product cannot go above 7 overall until real-music
listening evidence exists, because that is the thing customers pay for.

| Area | Score | Evidence |
|---|---|---|
| Billing correctness | 9 | Durable ledger; 18 race/outage/month-boundary tests; idempotent; reconciler. Not run against a real Firestore or emulator (−1) |
| Job lifecycle (cancel / timeout / crash) | 9 | Killable process groups; live cancel measured; stale-result suppression tested. Single Python instance assumed |
| Resource safety | 8 | Memory-aware admission with a measured model (1–8 min). Not measured on production hardware; reference cost not measured |
| Stems | 6 | Real Demucs measured and full pipeline run once. Capped at ~6 min on 4 vCPU. No separation listening; serialized, so capacity is limited |
| DSP regression protection | 8 | Synthetic gate, 0 drift, in CI. Real-corpus gate exists but has no corpus |
| Audio quality evidence | 3 | None from listening. Workflow ready (`benchmark/blind_ab.py`) |
| Localization | 8 | Errors and warnings localized (en/sq). Remaining: 402 quota messages, improvement-check reasons |
| Professional tier value | 3 | Near-identical to Standard; roadmap only |

## Remaining blockers and risks

1. **Quality validation pending** (AUDIO_VALIDATION.md). This blocks any "professional quality" claim.
2. **First run on GitHub**: this tree's tests (forkserver, setpgrp, process
   kills) passed locally on Linux. The GitHub runner (Ubuntu) should behave the same, but this
   has not been observed yet.
3. **Deployment config**:
   * Set `MASTERING_MEMORY_BUDGET_MB` if the container has no cgroup memory limit and shares the host.
   * `docker-compose` should give the Python service a memory limit so the auto budget reads it.
   * The Python service needs `/jobs/*` reachable from Node only. It is today, on the internal network.
4. **Synchronous stem path**: one stem job at a time; a 4-min stem job holds the
   slot for about 11.5 min. Peak demand needs async jobs or a second worker.
5. **Stem billing policy**: decide whether "vocal left unchanged" should refund the stem credit (RESOURCE_BENCHMARKS.md, finding 4).
6. **Multi-instance**: the ledger is multi-instance safe; the Python job registry is
   per-process (cancel must reach the instance running the job).
7. **Not localized yet**:
   * pre-render 402 quota/plan messages (English `detail`; their codes are not yet mapped);
   * improvement-check reasons;
   * preset-engine warnings (they fall back to English text).

## Road to 9/10, in order

1. Blind listening: 15+ licensed mixes, 3+ listeners, `blind_ab tally` status `complete`.
2. Approve the real-corpus baseline; run `release-benchmark.yml` per engine release.
3. Run `/master` end to end against the Firestore emulator in CI (reserve → render → complete / refund).
4. Async job path for stems (the ledger and job ids already support it).
5. Album mastering (PROFESSIONAL_ROADMAP.md #1).

## Deployment checklist

- [ ] Review and approve this diff (not committed, pushed or deployed).
- [ ] CI green on GitHub for this tree.
- [ ] Python container memory limit set, or `MASTERING_MEMORY_BUDGET_MB` set explicitly.
- [ ] Watch logs for `Reservation reconcile:` lines after deploy (they should be rare).
- [ ] `curl python:8001/capacity` on the box: check `budget_mb` and `max_stem_duration_s`.
