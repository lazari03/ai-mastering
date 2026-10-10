# Billing rules (Level 2)

validated_commit: c88bc69 · owner: backend-engineer · reviewer: security-engineer
Full design + race analysis (do not duplicate here): `docs/audits/JOB_LIFECYCLE_AND_BILLING.md`.
Code: `backend-node/src/services/reservationLedger.js`, `entitlementsService.js`, `polarService.js`, `routes/webhookRoutes.js`.

## Invariants (a change that breaks one is a P0)
1. **A charge never exists without its reservation.** `renderReservations/{jobId}` is written in the same Firestore transaction as the counter.
2. **State machine** `reserved → processing → completed | refunded`; terminal transitions are state-conditioned → first one wins; repeats are no-ops.
3. **Idempotent reserve**: same id returns the existing reservation; a different uid on that id → 403.
4. **Never consume credits on a failed job**: any error path calls `refundWithRetry` (3 attempts); if all fail, the lease (25 min) lets the reconciler refund.
5. **Month boundary**: a monthly slot reserved in M and settled in M+1 is `expired`, never refunded into M+1. Credits and the Free lifetime trial are always refunded.
6. **Fail closed**: entitlement read or reserve error → 503 `billing_unavailable`, nothing charged. Lost race → 402 `*_reservation_conflict`.
7. **Never deliver an unpaid master**: if `complete` finds the reservation already refunded → delete job + files → 409 `reservation_expired`.
8. **Stem part refunded** when stem separation did not actually run (`refundStem: !stemSeparationRan`).
9. **Previews never reserve.** Browser disconnect does not cancel; delivered master is billed (deliberate).
10. Job record (SQLite) is written **before** `complete`, so a crash in between reconciles to *completed*.

## Counters (`users/{uid}`)
`freeMasterUsage {used}` (lifetime) · `masterQuota {month, used}` · `stemQuota {month, used}` · `extraMasterCredits` · `extraStemCredits`.
Limits: `PLAN_MASTER_LIMITS = {free: 3, indie: 15, studio: 50, pro: 250}`, `STEM_MONTHLY_LIMIT = 20` (pro only).

## Reconciler
Every 5 min (+60 s after boot); query `leaseExpiresAt <= now`; job record exists → complete, else refund + ask Python to cancel/delete.
Disable: `RESERVATION_RECONCILE_INTERVAL_MS=0`.

## Required tests for any billing change
`cd backend-node && npm test` (reservationLedger, entitlementLifecycle, polarBilling — uses `__tests__/fakeFirestore.js`).
Gap: never run against a real Firestore emulator (`docs/audits/JOB_LIFECYCLE_AND_BILLING.md#not-covered`).
No real payments ever; Polar sandbox only, with product-owner approval.
