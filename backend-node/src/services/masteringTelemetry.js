// Aggregate-only DSP metrics for a finished render, attached to the
// server-side master_completed analytics event. Numbers and flags derived
// from the engine's own diagnostics (processing_applied.mastering_
// diagnostics) — no audio, no filenames, nothing user-identifying. Feeds
// the admin "Mastering engine" metrics (backoff rate, protection triggers,
// limiter and loudness averages).
const num = (v, digits = 2) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10 ** digits) / 10 ** digits : null);

export function masteringDspProps(result) {
  const applied = result?.processing_applied || {};
  const diag = applied.mastering_diagnostics;
  const target = result?.target_profile_used || {};
  const base = { genre: target.genre || null, style: target.style || null, engine: applied.engine || null };
  if (!diag?.mastering_plan) return base;
  const plan = diag.mastering_plan;
  const ev = diag.evaluation || {};
  const eq = plan.eq_decisions || [];
  const delivery = applied.delivery || {};
  const before = Number(result.before_lufs);
  const after = Number(result.after_lufs);
  return {
    ...base,
    eq_corrections: eq.length,
    dynamic_eq_corrections: (plan.dynamic_eq_decisions || []).length,
    compression: Boolean(plan.compression?.enabled),
    stereo_processing: Boolean(plan.stereo?.enabled),
    problems_detected: Object.keys(diag.detected_problems || {}).length,
    backoff: Boolean(diag.backoff_applied),
    eval_passed: ev.passed !== false,
    low_end_protection: eq.some((d) => (d.notes || []).some((n) => String(n).includes("low-end protection"))),
    hf_protection: (plan.notes || []).some((n) => String(n).includes("HF boost budget")),
    loudness_held_back: Boolean(plan.loudness?.constrained_by_limiter_budget),
    lufs_before: num(before),
    lufs_after: num(after),
    lufs_change: Number.isFinite(before) && Number.isFinite(after) ? num(after - before) : null,
    limiter_max_gr_db: num(ev.limiter?.max_gr_db),
    crest_change_db: num(ev.dynamics?.crest_change_db),
    // Which candidate won and why the first one didn't (initial / corrective_N /
    // transparent_fallback) — the production signal for tuning the verdict.
    delivered_candidate: delivery.candidate || diag.delivered_candidate || null,
    renders: Number.isFinite(Number(delivery.renders ?? diag.renders)) ? Number(delivery.renders ?? diag.renders) : null,
    transparent_fallback: Boolean(delivery.transparent_fallback),
    initial_failures: Array.isArray(delivery.initial_failures) && delivery.initial_failures.length ? delivery.initial_failures.join(",") : null,
  };
}
