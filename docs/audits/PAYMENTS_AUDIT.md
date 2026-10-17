# Payments audit: Polar, render ledger, entitlements

| | |
|---|---|
| Audit date | 2026-10-15 |
| Commit | `e441297`. The working tree also had uncommitted edits from another agent (error mapping in `masteringRoutes.js`, `masteringService.js`, `server.js`). Those edits do not touch billing logic. Line numbers in this report refer to `e441297`. |
| Role | payments-engineer (reviewer). No product code was changed. |
| Scope | Polar webhook (`routes/webhookRoutes.js`), `services/polarService.js` (checkout, change-plan, portal, subscription and order events, reconciliation), `services/reservationLedger.js` checked against `BILLING_RULES.md`, `services/entitlementsService.js`, and the `/master` and `/codec-preview` gates in `routes/masteringRoutes.js`, including anonymous and preview paths. |
| Tools | Code reading, `npm test`, throwaway `node:test` files kept in the session scratchpad and not committed. Those files used `mock.module` for `config/firebase.js` and `@polar-sh/sdk`, the repository's `__tests__/fakeFirestore.js` (with an `add()` shim), a real Express instance and signed or unsigned HTTP requests. |
| Limitations | No Firestore emulator and no Polar sandbox were available here. Polar payload shapes, the event ordering Polar actually produces, and `subscriptions.list` semantics were **not** checked against Polar. Production `firestore.rules` is git-ignored and was not seen. |

Known issues not repeated here: AURALITH-SECURITY-003 (preview compute from anonymous uids), AURALITH-BACKEND-005 (no client idempotency key; tags are parsed after reservation), AURALITH-QA-003 (no route-level `/master` tests) and AURALITH-DEVOPS-003 (no fail-fast on secrets).

## Summary

| ID | Sev | Title | Evidence |
|---|---|---|---|
| PAY-01 | **P1** | (embargoed — see local SECURITY_REPORT) | verified by test |
| PAY-02 | P2 | A late event for an *old* subscription id overwrites the user's current paid subscription | verified by test |
| PAY-03 | P2 | Reconciliation takes the newest-started subscription even if it is not entitled, and has no `modifiedAt` guard | verified by test (mocked Polar) |
| PAY-04 | P3 | `order.refunded` arriving before `order.paid` leaves the credit granted | verified by test |
| PAY-05 | P3 | Concurrent requests: a quota conflict returns 402 although the user still has paid credits | verified by test (ledger level) |
| PAY-06 | P3 | Reconciler refunds a *delivered* master if `recordJob` and `complete` both failed | verified by test (ledger level) |
| PAY-07 | P3 | Client-supplied `success_url` is passed to Polar checkout unvalidated | by reading |
| PAY-08 | P3 | Free 30 s preview is a downloadable full-quality master; a track of 30 s or less is mastered in full for free, anonymous users included | by reading |
| PAY-09 | P3 | Legacy consume and refund helpers outside the ledger are still exported (no callers) | by reading |
| PAY-10 | P3 | One-time orders always grant +1, whatever the order quantity | by reading, unverified vs Polar |

**No entitlement bypass was found on `/master` or `/codec-preview`.** The negative results are listed at the end.

## Verified findings

### PAY-01 · P1 · node.gateway — (embargoed — see local SECURITY_REPORT)
- Evidence: verified by test (scratchpad W2). The details are not recorded in this public repository.
- Fix: (embargoed). Effort S. Confidence high.

### PAY-02 · P2 · billing.polar — a stale event for another subscription id overwrites the current one
- Evidence: `polarService.js:534-561`. The out-of-order guard compares only `modifiedAt` for the *field* (`subscription`). It never compares `polarSubscriptionId`.
- Root cause: one Firestore field holds "the" subscription, but a customer can have several Polar subscriptions over time (A cancelled, then B started). A delayed `subscription.revoked` or `updated` for A that carries a newer `modifiedAt` than B's stored record replaces B.
- Impact: a paying customer is shown as Free (402 on render) until B's next event, or until the 6-hourly reconcile (which may itself pick wrongly, see PAY-03).
- Test: W6. B is `active`. Then A is `revoked` with a newer `modifiedAt`. The stored record becomes A and `planFromUserData` returns `"free"`.
- Fix: when `incoming.polarSubscriptionId !== stored.polarSubscriptionId`, never let a non-entitled incoming record replace an entitled stored one. Alternatively keep a map keyed by subscription id and derive the plan from the best entitled entry. Effort S–M. Confidence high for the logic. How often Polar actually produces this ordering is unverified.

### PAY-03 · P2 · billing.polar — reconciliation can downgrade, or re-entitle, wrongly
- Evidence:
  - `polarService.js:684-701` (`reconcileUserSubscription`): items sorted by `-started_at`, first item per field wins, plain `set` with no transaction and no `modifiedAt` check.
  - The same unguarded pattern appears in `backfillOrphanedSubscriptions` (`:756-758`, check-then-set) and in `changeSubscriptionPlan` (`:313`).
- Impact:
  - (a) If Polar lists a newer non-entitled subscription (for example a failed or `incomplete_expired` checkout), every pass overwrites the user's active one, so a paying user is downgraded every 6 h.
  - (b) A list snapshot older than a just-applied webhook (for example `revoked`) re-entitles the user until the next event or pass.
- Tests (with a mocked Polar client):
  - W7: an active older subscription plus a newer `incomplete_expired` one makes the user Free.
  - W8: stored `revoked`, then an older `active` snapshot, makes the user `pro`.
- Whether Polar's `subscriptions.list` returns incomplete or expired items is **unverified** (no sandbox).
- Fix:
  - Prefer an `isEntitled` item over the newest one.
  - Write inside a transaction that applies the same `modifiedAt` guard as the webhook path.
  - Apply the same guard in `backfill` and `changeSubscriptionPlan`.
- Effort: S. Confidence: high for the code, medium for real-world frequency.

### PAY-04 · P3 · billing.polar — refund before paid leaves the credit
- Evidence: `polarService.js:464-480`. A refund with no `processedPolarOrders/{id}` record is a silent no-op. A later `order.paid` (for example a retry after a 500) then grants the credit (`:628-652`).
- Test: W5 leaves 1 credit after a full refund.
- Fix: on refund with no processed record, write a tombstone `{refundedAt}` so that `order.paid` skips the order. Effort S. Confidence: high for the code. The ordering is rare, because refunds are usually days later.

### PAY-05 · P3 · billing.ledger — spurious 402 under concurrency
- Evidence: `masteringRoutes.js:879-922`. The route chooses `quota` or `credit` from a snapshot read. `reserve` then only tries that part (`reservationLedger.js:111-115`).
- Example: a user with 1 quota slot and 5 credits fires two renders. Both choose `quota`, and the second gets `master_reservation_conflict` (402) although credits remain.
- Test: D4.
- Fix: let `reserve` fall back from the quota counter to the credit counter inside the same transaction. Effort S. No over-charge; this is UX only.

### PAY-06 · P3 · billing.ledger — a delivered master can be refunded
- Evidence:
  - `masteringRoutes.js:1098-1102`: a `recordJob` failure is swallowed.
  - `:1110-1117`: a `complete` failure is swallowed, and the master is delivered.
  - The reconciler decides from `ownsJob` (SQLite): with no record it refunds (`reservationLedger.js:195-196`).
- Impact: one unbilled master, which contradicts invariant 9 ("delivered master is billed"). It needs SQLite and Firestore to fail together, so it is a revenue leak rather than user harm.
- Test: D5, at ledger level.
- Fix: if `recordJob` fails, either fail the request (refund, then error) or retry `complete` before responding. Effort S.

### PAY-07 · P3 · billing.checkout — unvalidated `success_url`
- Evidence: `masteringRoutes.js:535` passes `req.body.success_url` to `checkouts.create` (`polarService.js:177-182`).
- Impact: after a real payment, Polar redirects to any URL the caller chose. This is phishing-friendly ("re-enter your card"). It is limited to the caller's own checkout unless the link is shared.
- Fix: allow only URLs under `settings.frontendOrigin`. Effort S. By reading; whether Polar validates the URL is unverified.

### PAY-08 · P3 · product.entitlements — preview output is a real deliverable
- Evidence:
  - `masteringRoutes.js:737-739`, `:963-967` and `services/previewExcerpt.js:57-87`: the loudest 30 s, full format.
  - Preview jobs pass `ownsJob`, so `/download/:jobId.:ext` (`:1295`) serves them.
  - Anonymous uids may preview (`:753` only blocks non-preview).
- Impact: jingles, idents and short loops of 30 s or less get a complete free master with unlimited retries. Longer tracks can be chunked (with audible 50 ms fades).
- Fix: a product decision. Options: lower bit-rate or watermarked preview downloads, or no download for preview jobs (playback only). Effort S–M.

### PAY-09 · P3 · billing.entitlements — non-ledger counter mutators still exported
- Evidence: `entitlementsService.js:36-225` (`consumeMasterQuota`, `consumeExtraCredit`, `refund*`, and others). A grep finds no callers in `src/`.
- Risk: reintroducing one bypasses the reservation document (invariant 1). Fix: delete them. Effort S.

### PAY-10 · P3 · billing.polar — quantity ignored
- Evidence: `polarService.js:648-650` always adds `credits + 1`. If a Polar product ever allows quantity greater than 1, the customer pays for N and receives 1.
- Fix: grant `order.items` quantity, or lock the product to quantity 1 in Polar. Unverified against Polar.

## Unverified concerns (no sandbox or emulator)
- **Firestore rules**: the frontend has no Firestore SDK (grep), so the gateway is the only client. Production rules should deny all client reads and writes on `users`, `renderReservations` and `processedPolarOrders`. This must be confirmed in the Firebase console, because `firestore.rules` is git-ignored (see DATABASE_AUDIT DB-11).
- **Double subscriptions**: two concurrent `/billing/checkout` calls from a Free user produce two checkout URLs. Polar's "one active subscription per customer" setting is the only guard. Combined with PAY-02, the second subscription's events overwrite the first's.
- **Refund policy**: `order.refunded` for a *subscription* order changes nothing locally. Access ends only if Polar also revokes the subscription.
- **Webhook secret unset**: verified to fail closed (400; W1). There is no startup fail-fast (AURALITH-DEVOPS-003).

## Verified not vulnerable (negative results)
- **Professional engine**: `tier` is forced to `standard` on preview (`:738`), and non-preview Professional on Free or Indie gets 402 (`:833-837`).
- **Stems**: forced off on preview (`:739`) and gated plus reserved otherwise. Presets can no longer enable stems: `masteringService.js:100-103`, and `mix_preset` is not forwarded to Python.
- **Max length**: there is no per-plan length entitlement. Python's global cap (`MASTERING_MAX_DURATION_MINUTES`, 15) applies to everyone.
- **Anonymous**: a non-preview request gets 403 `ACCOUNT_REQUIRED` (`:753`). An unverified email gets 403 for a final master (`:744`).
- **`/codec-preview`**: checks job id format and ownership (`:1218-1226`) and spends nothing.
- **Refund on failure**: every throw after `reserve` sits inside the `try` and reaches `refundWithRetry` (`:1146`). Validation that can fail runs before `reserve` (`:765-779`). A Firestore outage falls back to the lease and the reconciler (covered by the existing ledger tests).
- **Webhook signature**: Standard Webhooks HMAC with a 5-minute timestamp tolerance (SDK 0.49.0, `standardwebhooks` 1.0.0) and a constant-time compare. The raw body is used before JSON parsing.
- **Replay**: `order.paid` is replay-safe (W4).

## Tests performed
- `cd backend-node && npm test`: 71/71 pass on the working tree (the brief expected 68; the 3 extra are another agent's uncommitted `clientError.test.js`).
- Scratchpad `payments.audit.test.mjs` (8/8 pass, assertions encode the defect): W1 secret unset, W2 (embargoed), W3 non-JSON body, W4 replay, W5 refund-before-paid, W6 stale subscription id, W7 reconcile picks a non-entitled item, W8 reconcile has no `modifiedAt` guard.
- Scratchpad `db.audit.test.mjs` D4 and D5 (ledger level).
- No test was added to the repository.

## Recommendations (in order)
1. PAY-01 (embargoed fix, S).
2. PAY-02 and PAY-03: one helper `applySubscriptionRecord(tx, field, incoming)` with an id-aware, entitlement-aware, `modifiedAt`-guarded merge, used by the webhook, reconcile, backfill and change-plan paths. Regression tests W6–W8 (and route those tests through the ledger test style).
3. PAY-07 `success_url` allow-list. PAY-04 refund tombstone. PAY-09 delete the dead mutators.
4. Product decision on PAY-08.
5. A Polar sandbox run of W5–W8 with real payloads before closing PAY-02 to PAY-04.

## Remaining risks
- No emulator or sandbox: transaction contention, `!= null` map queries and Polar payload shapes are untested in production conditions.
- `/master` still has no route-level tests (AURALITH-QA-003). The findings above were exercised at service level only.
- An error after a successful `complete` (for example in `res.json`) returns an error to a user who was charged and has the job in My Masters. Not observed; by reading.
