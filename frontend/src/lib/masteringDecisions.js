// Turns the engine's own diagnostics (processing_applied.mastering_diagnostics,
// written by backend ai_mastering/mastering.py: source_profile,
// detected_problems, mastering_plan, evaluation, backoff) into the "what
// Auralith changed" summary. Nothing here is inferred or decorative: every
// row is a decision the engine recorded. Jobs mastered before diagnostics
// existed return null, and the caller falls back to the plain numbers.

const REGIONS = [
  // 160 Hz split (not the evaluator's 120): the engine files ~120 Hz as
  // "upper bass", and that's what a musician would call it too.
  { key: "lowEnd", lo: 0, hi: 160, evalKey: "low_end_40_120" },
  { key: "lowMids", lo: 160, hi: 500, evalKey: "low_mid_120_500" },
  { key: "mids", lo: 500, hi: 4000, evalKey: "mid_500_4k" },
  { key: "presence", lo: 4000, hi: 14000, evalKey: "hf_4k_14k" },
  { key: "air", lo: 14000, hi: 30000, evalKey: "air_14k_up" },
];

const round1 = (n) => Math.round(n * 10) / 10;
const firstFinite = (...vals) => {
  const hit = vals.map(Number).find((v) => Number.isFinite(v));
  return hit === undefined ? NaN : hit;
};

// Passed / passed with warnings / failed — from the final QC report, plus
// the check on the delivered file. A master with QC warnings is never
// summarized as a plain "passed".
export function qcVerdict(result, evaluation = {}) {
  const qc = result?.quality_control || {};
  const warnings = (qc.checks || []).filter((c) => c.status === "warn").map((c) => c.message);
  const failures = (qc.checks || []).filter((c) => c.status === "fail").map((c) => c.message);
  const failed = qc.passed === false || evaluation.passed === false || failures.length > 0;
  const delivery = result?.processing_applied?.delivery_check || null;
  return {
    status: failed ? "failed" : warnings.length ? "warned" : "passed",
    passed: !failed,
    warnings,
    failures,
    delivery: delivery
      ? {
          format: delivery.format,
          passed: delivery.passed !== false,
          truePeak: Number.isFinite(delivery.true_peak_dbtp) ? round1(delivery.true_peak_dbtp) : null,
          clipped: Number(delivery.clipped_samples) || 0,
          trimDb: Number(delivery.gain_trim_db) > 0 ? round1(delivery.gain_trim_db) : 0,
        }
      : null,
  };
}

// A full preset / Pro manual chain runs the literal chain, not the adaptive
// plan — so there are no "decisions" to show, and it must not be presented
// as if there were. What there is: the chain's stages, every value the
// safety limits pulled back, the QC verdict and the delivery check.
export function summarizeManualChain(result) {
  const applied = result?.processing_applied;
  if (!applied || applied.chain_type !== "manual") return null;
  const lim = applied.limiter || {};
  return {
    stages: (applied.stages || []).filter((s) => s !== "input"),
    adjustments: applied.safety_adjustments || [],
    recovery: applied.qc_recovery || null,
    limiterMaxDb: Number.isFinite(lim.limiter_gain_reduction_db) ? round1(lim.limiter_gain_reduction_db) : null,
    limiterLoudHitsDb: Number.isFinite(lim.gr_at_p995_peaks_db) ? round1(lim.gr_at_p995_peaks_db) : null,
    beforeLufs: Number.isFinite(result.before_lufs) ? round1(result.before_lufs) : null,
    afterLufs: Number.isFinite(result.after_lufs) ? round1(result.after_lufs) : null,
    verification: qcVerdict(result),
  };
}

export function formatHz(hz) {
  if (!Number.isFinite(hz)) return "";
  return hz >= 1000 ? `${round1(hz / 1000)} kHz` : `${Math.round(hz)} Hz`;
}

export function humanizeProblem(kind) {
  if (!kind) return "";
  const s = String(kind).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function regionFor(hz) {
  return REGIONS.find((r) => hz >= r.lo && hz < r.hi) || null;
}

export function summarizeDecisions(result) {
  const diag = result?.processing_applied?.mastering_diagnostics;
  if (!diag || !diag.mastering_plan) return null;

  const plan = diag.mastering_plan;
  const evaluation = diag.evaluation || {};
  const problems = diag.detected_problems || {};
  const eq = [...(plan.eq_decisions || []), ...(plan.dynamic_eq_decisions || []).map((d) => ({ ...d, dynamic: true }))];
  // Problems the user's reference track asked for (see backend
  // diagnostics/problems.py reference_driven) — shown as such.
  const referenceKinds = new Set(Object.values(problems).filter((p) => p.reference_driven).map((p) => p.kind));

  // ---- tonal regions ----------------------------------------------------
  const regions = REGIONS.map((region) => {
    const moves = eq
      .filter((d) => {
        const hz = Number(d.frequency_hz ?? d.center_hz);
        return Number.isFinite(hz) && regionFor(hz)?.key === region.key;
      })
      .map((d) => ({
        hz: Number(d.frequency_hz ?? d.center_hz),
        gainDb: round1(Number(d.gain_db ?? -(d.max_reduction_db || 0))),
        // Dynamic-EQ decisions carry a prose reason, not a problem key.
        problem: d.problem || (d.dynamic ? "intermittent_build_up" : String(d.reason || "").replace(/^measured_/, "")),
        dynamic: Boolean(d.dynamic),
        fromReference: referenceKinds.has(d.problem),
        confidence: d.confidence ?? null,
      }));
    const detectedOnly = Object.values(problems).filter(
      (p) => p.category === "tonal" && Number.isFinite(p.center_hz) && regionFor(p.center_hz)?.key === region.key && !moves.some((m) => m.problem === p.kind)
    );
    const actualDb = evaluation.regions?.[region.evalKey]?.actual_db;
    let status = "preserved";
    if (moves.length) status = "corrected";
    else if (detectedOnly.length) status = "noted";
    return {
      key: region.key,
      status,
      moves,
      noted: detectedOnly.map((p) => ({ problem: p.kind, hz: p.center_hz, confidence: p.confidence })),
      actualDb: Number.isFinite(actualDb) ? round1(actualDb) : null,
    };
  });

  // ---- dynamics -----------------------------------------------------------
  const comp = plan.compression || {};
  const compressionOn = Boolean(comp.enabled || comp.multiband?.enabled || comp.glue?.enabled);
  const rejectedComp = (plan.rejected_decisions || []).find((r) => r.stage === "compression");
  const dyn = evaluation.dynamics || {};
  // Two limiter numbers, not one: the deepest single dip (one hit can take
  // a lot without it being audible) and the reduction across the loud hits
  // (99.5th-percentile peaks — what decides whether drums still punch).
  // Status is judged on the loud hits, where it's audible; the deepest dip
  // only escalates it past the QC fail line.
  const limiterMax = firstFinite(evaluation.limiter?.max_gr_db, result.processing_applied?.limiter?.limiter_gain_reduction_db);
  const limiterLoudHits = firstFinite(evaluation.limiter?.gr_at_p995_peaks_db, result.processing_applied?.limiter?.gr_at_p995_peaks_db);
  const limiterBudget = firstFinite(evaluation.limiter?.budget_db, result.processing_applied?.limiter?.budget_db);
  const clipperGr = Number(result.processing_applied?.limiter?.clipper_gain_reduction_db ?? 0);
  const judgedGr = Number.isFinite(limiterLoudHits) ? limiterLoudHits : limiterMax;
  const limiterWorked = Number.isFinite(judgedGr) && judgedGr >= 1.5;
  const crestLoss = Number(dyn.crest_before_db) - Number(dyn.crest_after_db);
  const heavyControl = judgedGr > 3 || limiterMax > 6 || clipperGr > 2 || crestLoss > 6 || result.quality_control?.passed === false;
  const dynamics = {
    status: heavyControl ? "heavy" : compressionOn ? "corrected" : limiterWorked || clipperGr >= 0.5 ? "light" : "preserved",
    limiterMaxDb: Number.isFinite(limiterMax) ? round1(limiterMax) : null,
    limiterLoudHitsDb: Number.isFinite(limiterLoudHits) ? round1(limiterLoudHits) : null,
    limiterBudgetDb: Number.isFinite(limiterBudget) ? round1(limiterBudget) : null,
    clipperGrDb: Number.isFinite(clipperGr) ? round1(clipperGr) : null,
    multiband: Boolean(comp.multiband?.enabled),
    glue: Boolean(comp.glue?.enabled),
    limiterOnly: Boolean(rejectedComp && /limiter alone/.test(rejectedComp.reason || "")),
    crestBefore: Number.isFinite(dyn.crest_before_db) ? round1(dyn.crest_before_db) : null,
    crestAfter: Number.isFinite(dyn.crest_after_db) ? round1(dyn.crest_after_db) : null,
    lraBefore: Number.isFinite(dyn.lra_before_lu) ? round1(dyn.lra_before_lu) : null,
    lraAfter: Number.isFinite(dyn.lra_after_lu) ? round1(dyn.lra_after_lu) : null,
    plrBefore: Number.isFinite(dyn.plr_before_db) ? round1(dyn.plr_before_db) : null,
    plrAfter: Number.isFinite(dyn.plr_after_db) ? round1(dyn.plr_after_db) : null,
  };

  // ---- stereo -------------------------------------------------------------
  const st = plan.stereo || {};
  const stereo = {
    status: st.enabled ? "corrected" : "preserved",
    lowEndMonoHz: st.lf_mono?.enabled ? st.lf_mono.cutoff_hz : null,
    sideGainDb: Number.isFinite(st.side_gain_db) && Math.abs(st.side_gain_db) >= 0.05 ? round1(st.side_gain_db) : null,
  };

  // ---- loudness -----------------------------------------------------------
  const loud = plan.loudness || {};
  const beforeLufs = Number(result.before_lufs ?? loud.source_lufs);
  const afterLufs = Number(result.after_lufs ?? result.analysis_after?.integrated_lufs);
  const loudness = {
    beforeLufs: Number.isFinite(beforeLufs) ? round1(beforeLufs) : null,
    afterLufs: Number.isFinite(afterLufs) ? round1(afterLufs) : null,
    changeLu: Number.isFinite(beforeLufs) && Number.isFinite(afterLufs) ? round1(afterLufs - beforeLufs) : null,
    preferredLufs: Number.isFinite(loud.preferred_lufs) ? round1(loud.preferred_lufs) : null,
    heldBackForTransients: Boolean(loud.constrained_by_limiter_budget),
    truePeakAfter: Number.isFinite(evaluation.true_peak_db) ? round1(evaluation.true_peak_db) : null,
    truePeakBefore: Number.isFinite(diag.source_profile?.true_peak_db) ? round1(diag.source_profile.true_peak_db) : null,
  };

  // ---- verification ----------------------------------------------------
  const outcomes = evaluation.problem_outcomes || {};
  const verification = {
    ...qcVerdict(result, evaluation),
    backoffApplied: Boolean(diag.backoff_applied),
    transparentFallback: Boolean(result?.processing_applied?.delivery?.transparent_fallback),
    flags: evaluation.flags || [],
    improved: Object.values(outcomes).filter((o) => o.improved).length,
    checked: Object.keys(outcomes).length,
  };

  const dynTouched = dynamics.status !== "preserved";
  const corrections = regions.reduce((n, r) => n + r.moves.length, 0) + (dynTouched ? 1 : 0) + (st.enabled ? 1 : 0);
  const untouched = regions.filter((r) => r.status !== "corrected").length + (dynTouched ? 0 : 1) + (st.enabled ? 0 : 1);

  return { regions, dynamics, stereo, loudness, verification, counts: { corrections, untouched }, engine: diag.engine || null };
}

// Everything the detailed view shows, from the before/after analyses.
export function detailedMetrics(result) {
  const b = result?.analysis_before || {};
  const a = result?.analysis_after || {};
  const sb = result?.processing_applied?.mastering_diagnostics?.source_profile || {};
  const ev = result?.processing_applied?.mastering_diagnostics?.evaluation || {};
  const pick = (...vals) => vals.find((v) => Number.isFinite(v));
  return [
    { key: "lufs", before: pick(b.integrated_lufs, sb.integrated_lufs), after: pick(a.integrated_lufs, ev.loudness?.integrated_lufs), unit: "LUFS" },
    { key: "truePeak", before: pick(b.true_peak_db, sb.true_peak_db), after: pick(a.true_peak_db, ev.true_peak_db), unit: "dBTP" },
    { key: "lra", before: pick(b.loudness_range_lu, sb.lra_lu, ev.dynamics?.lra_before_lu), after: pick(a.loudness_range_lu, ev.dynamics?.lra_after_lu), unit: "LU" },
    { key: "plr", before: pick(sb.plr_db, ev.dynamics?.plr_before_db), after: pick(ev.dynamics?.plr_after_db), unit: "dB" },
    { key: "crest", before: pick(ev.dynamics?.crest_before_db, sb.crest_db), after: pick(ev.dynamics?.crest_after_db), unit: "dB" },
    { key: "correlation", before: pick(sb.stereo_correlation, ev.stereo?.correlation_before), after: pick(ev.stereo?.correlation_after), unit: "" },
    { key: "limiterGr", before: null, after: pick(ev.limiter?.max_gr_db), unit: "dB" },
    { key: "limiterLoudHits", before: null, after: pick(ev.limiter?.gr_at_p995_peaks_db), unit: "dB" },
  ].filter((m) => Number.isFinite(m.before) || Number.isFinite(m.after));
}
