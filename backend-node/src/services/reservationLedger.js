import { getFirestore } from "../config/firebase.js";

// Durable reservations for everything a render spends.
//
// Each render gets ONE document, renderReservations/{reservationId}, written
// in the SAME Firestore transaction as the counter it charges. A charge can
// therefore never exist without its reservation (or the other way round),
// and every later step is a state-conditioned transition on that document:
//
//     reserved ──> processing ──> completed
//         │             │
//         └─────────────┴──────> refunded   (render failed, timed out,
//                                            was cancelled, or abandoned)
//
// * Idempotent: reserving an id that exists returns it; completing or
//   refunding a reservation that is already terminal is a no-op. Retries,
//   duplicate callbacks and races (cancellation vs completion) can't charge
//   or refund twice — whichever terminal transition commits first wins.
// * Recoverable: each open reservation carries a lease. If the process that
//   owns it dies (restart, crash) or its refund can't be written (Firestore
//   outage), reconcileAbandoned() later finds the expired lease and settles
//   it: completed if the job was delivered (a job record exists), refunded
//   otherwise. Nothing depends on the original request surviving.
// * Same counters, same semantics as entitlementsService.js: freeMasterUsage
//   (lifetime), masterQuota / stemQuota ({month, used}), extraMasterCredits,
//   extraStemCredits. A monthly slot reserved last month is NOT refunded
//   into this month (that would mint a master), exactly like refundMonthly.
//   No balance migration: existing documents are read as they are.

export const RESERVATIONS = "renderReservations";
// Longer than any render may run (gateway deadline 19 min,
// pythonUpstream.js) so a live job is never reconciled under itself.
export const DEFAULT_LEASE_MS = 25 * 60 * 1000;
const OPEN = new Set(["reserved", "processing"]);

export function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

// ---- counter arithmetic (pure; shapes match entitlementsService.js) -----

function take(user, part, ctx) {
  const { kind, counter } = part;
  if (kind === "credit") {
    const credits = Number(user[counter] || 0);
    if (credits <= 0) return null;
    return { [counter]: credits - 1 };
  }
  if (counter === "freeMasterUsage") {
    const used = Number(user.freeMasterUsage?.used || 0);
    if (used >= part.limit) return null;
    return { freeMasterUsage: { used: used + 1 } };
  }
  const q = user[counter];
  const used = q?.month === ctx.month ? Number(q.used || 0) : 0;
  if (used >= part.limit) return null;
  return { [counter]: { month: ctx.month, used: used + 1 } };
}

function giveBack(user, part, ctx) {
  const { kind, counter } = part;
  if (kind === "credit") return { update: { [counter]: Number(user[counter] || 0) + 1 }, status: "refunded" };
  if (counter === "freeMasterUsage") {
    const used = Number(user.freeMasterUsage?.used || 0);
    return used > 0 ? { update: { freeMasterUsage: { used: used - 1 } }, status: "refunded" } : { update: null, status: "refunded" };
  }
  const q = user[counter];
  // Taken in an earlier month: that month's count is gone (reset), and
  // decrementing this month's would hand out an extra master.
  if (!q || q.month !== ctx.month || part.month !== ctx.month) return { update: null, status: "expired" };
  const used = Number(q.used || 0);
  return used > 0 ? { update: { [counter]: { month: ctx.month, used: used - 1 } }, status: "refunded" } : { update: null, status: "refunded" };
}

// needs.master / needs.stem: "quota" | "credit" | null (decided by the route)
export function partsFor({ plan, quotaLimit, needs, stemLimit }) {
  const parts = {};
  if (needs.master === "quota") parts.master = { kind: "quota", counter: plan === "free" ? "freeMasterUsage" : "masterQuota", limit: quotaLimit };
  else if (needs.master === "credit") parts.master = { kind: "credit", counter: "extraMasterCredits" };
  if (needs.stem === "quota") parts.stem = { kind: "quota", counter: "stemQuota", limit: stemLimit };
  else if (needs.stem === "credit") parts.stem = { kind: "credit", counter: "extraStemCredits" };
  return parts;
}

export function createLedger({ db: dbArg, now = () => new Date(), leaseMs = DEFAULT_LEASE_MS } = {}) {
  const db = () => dbArg || getFirestore();
  const userRef = (uid) => db().collection("users").doc(uid);
  const resRef = (id) => db().collection(RESERVATIONS).doc(id);

  // All parts or none, in one transaction with the reservation record.
  async function reserve({ reservationId, uid, plan, jobId, parts }) {
    return db().runTransaction(async (tx) => {
      const existing = await tx.get(resRef(reservationId));
      if (existing.exists) {
        const r = existing.data();
        if (r.uid !== uid) throw Object.assign(new Error("reservation belongs to another user"), { status: 403 });
        return { ok: OPEN.has(r.state) || r.state === "completed", existing: true, reservation: r };
      }
      const t = now();
      const ctx = { month: monthKey(t) };
      const user = (await tx.get(userRef(uid))).data() || {};
      const updates = {};
      const held = {};
      for (const [name, part] of Object.entries(parts)) {
        // Apply against the user doc as already updated by earlier parts.
        const change = take({ ...user, ...updates }, part, ctx);
        if (!change) return { ok: false, failed: name };
        Object.assign(updates, change);
        held[name] = { ...part, month: ctx.month, status: "held" };
      }
      if (Object.keys(updates).length) tx.set(userRef(uid), updates, { merge: true });
      const record = { uid, plan, jobId: jobId || null, state: "reserved", parts: held, createdAt: t, updatedAt: t, leaseExpiresAt: new Date(t.getTime() + leaseMs), history: [{ state: "reserved", at: t }] };
      tx.set(resRef(reservationId), record);
      return { ok: true, existing: false, reservation: record };
    });
  }

  async function transition(reservationId, from, to, mutate) {
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(resRef(reservationId));
      if (!snap.exists) return { ok: false, state: "missing" };
      const r = snap.data();
      if (!from.has(r.state)) return { ok: false, state: r.state };
      const t = now();
      const patch = (await mutate?.(tx, r, t)) || {};
      tx.set(
        resRef(reservationId),
        { ...patch, state: to, updatedAt: t, leaseExpiresAt: to === "completed" || to === "refunded" ? null : toDate(r.leaseExpiresAt), history: [...(r.history || []), { state: to, at: t, ...(patch.reason ? { reason: patch.reason } : {}) }] },
        { merge: true },
      );
      return { ok: true, state: to };
    });
  }

  function refundParts(names) {
    return async (tx, r, t) => {
      const ctx = { month: monthKey(t) };
      const user = (await tx.get(userRef(r.uid))).data() || {};
      const updates = {};
      const parts = { ...r.parts };
      for (const name of names) {
        const part = parts[name];
        if (!part || part.status !== "held") continue;
        const { update, status } = giveBack({ ...user, ...updates }, part, ctx);
        if (update) Object.assign(updates, update);
        parts[name] = { ...part, status };
      }
      if (Object.keys(updates).length) tx.set(userRef(r.uid), updates, { merge: true });
      return { parts };
    };
  }

  // `refundStem`: separation was requested and paid for but didn't run.
  const complete = (id, { refundStem = false } = {}) =>
    transition(id, OPEN, "completed", async (tx, r, t) => {
      const out = refundStem ? await refundParts(["stem"])(tx, r, t) : { parts: { ...r.parts } };
      for (const [name, part] of Object.entries(out.parts)) if (part.status === "held") out.parts[name] = { ...part, status: "kept" };
      return out;
    });
  const refund = (id, reason) =>
    transition(id, OPEN, "refunded", async (tx, r, t) => ({ ...(await refundParts(Object.keys(r.parts || {}))(tx, r, t)), reason: String(reason || "refunded") }));

  return {
    reserve,
    markProcessing: (id) => transition(id, new Set(["reserved"]), "processing"),
    complete,
    refund,
    get: async (id) => {
      const snap = await resRef(id).get();
      return snap.exists ? snap.data() : null;
    },
    // Settles every open reservation whose lease has expired. `jobDelivered`
    // decides completed vs refunded (a delivered master is never refunded);
    // `onAbandoned` lets the caller stop orphaned upstream work. Safe to run
    // concurrently from several processes: each settle is a conditioned
    // transition, so a reservation is settled exactly once.
    async reconcileAbandoned({ jobDelivered = async () => false, onAbandoned = async () => {}, limit = 100 } = {}) {
      const due = await db().collection(RESERVATIONS).where("leaseExpiresAt", "<=", now()).limit(limit).get();
      const summary = { examined: 0, completed: 0, refunded: 0, skipped: 0, errors: 0 };
      for (const doc of due.docs) {
        summary.examined += 1;
        const r = doc.data();
        if (!OPEN.has(r.state)) {
          summary.skipped += 1;
          continue;
        }
        try {
          const delivered = r.jobId ? await jobDelivered(r.uid, r.jobId) : false;
          const result = delivered ? await complete(doc.id) : await refund(doc.id, "abandoned: lease expired without completion");
          if (result.ok) summary[delivered ? "completed" : "refunded"] += 1;
          else summary.skipped += 1;
          if (!delivered && r.jobId) await onAbandoned(r.jobId).catch(() => {});
        } catch (error) {
          summary.errors += 1;
          console.error(`Reconcile of reservation ${doc.id} failed (will retry next pass):`, error.message);
        }
      }
      return summary;
    },
  };
}
