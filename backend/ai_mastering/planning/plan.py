"""MasteringPlan: the explicit, serialisable decision record between
diagnosis and DSP.

    source profile -> problems -> confidence gates -> budgets -> plan

Every stage of the render reads its settings from the plan and nothing
else; every decision carries a reason and a confidence, and every decision
NOT taken is recorded in `rejected_decisions` with why. The plan answers
"why did Auralith boost 14 kHz?" and "why was compression disabled?".
"""

from __future__ import annotations

import copy
from dataclasses import asdict, dataclass, field

import numpy as np

from ..analysis.profile import SourceProfile
from ..diagnostics.problems import Problem, problems_to_dict
from ..processing.eq import band_response_db, q_for_bandwidth
from . import config as C
from .budgets import calculate_change_budget, calculate_compression_need, calculate_limiter_budget
from .target_model import TargetContext


@dataclass
class EQDecision:
    filter_type: str          # bell | low_shelf | high_shelf
    frequency_hz: float
    gain_db: float
    q: float
    confidence: float
    reason: str
    source: str = "automatic"  # automatic | user_tweak
    problem: str | None = None
    notes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("frequency_hz", "gain_db", "q", "confidence"):
            d[k] = round(float(d[k]), 3)
        return d


@dataclass
class DynamicEQDecision:
    frequency_hz: float
    q: float
    max_reduction_db: float
    threshold_percentile: float
    release_ms: float
    confidence: float
    reason: str
    problem: str | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("frequency_hz", "q", "max_reduction_db", "confidence"):
            d[k] = round(float(d[k]), 3)
        return d


@dataclass
class MasteringPlan:
    sample_rate: int
    tier: str
    source_state: dict
    detected_problems: dict
    target_context: dict
    eq_decisions: list
    dynamic_eq_decisions: list
    compression: dict
    deesser: dict
    saturation: dict
    stereo: dict
    clipper: dict
    limiter: dict
    loudness: dict
    change_budget: dict
    band_layout: list
    rejected_decisions: list = field(default_factory=list)
    expected: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)
    user_tweaks: dict = field(default_factory=dict)
    backoff: dict | None = None

    def to_dict(self) -> dict:
        d = {k: copy.deepcopy(v) for k, v in self.__dict__.items() if k not in ("eq_decisions", "dynamic_eq_decisions", "band_layout")}
        d["eq_decisions"] = [e.to_dict() for e in self.eq_decisions]
        d["dynamic_eq_decisions"] = [e.to_dict() for e in self.dynamic_eq_decisions]
        return d

    def copy(self) -> "MasteringPlan":
        return copy.deepcopy(self)

    def refresh_expected(self) -> None:
        """Recompute the plan's predicted per-band EQ change from the exact
        filters the renderer will apply."""
        eq_change = band_response_db(self.eq_decisions, self.band_layout, self.sample_rate)
        self.expected["eq_band_change_db"] = {k: round(v, 3) for k, v in eq_change.items()}
        hf = [v for b, v in zip(self.band_layout, eq_change.values()) if b["center_hz"] >= C.HF_BUDGET_START_HZ]
        low = [v for b, v in zip(self.band_layout, eq_change.values()) if C.LOW_END_PROTECT_RANGE_HZ[0] <= b["center_hz"] <= C.LOW_END_PROTECT_RANGE_HZ[1]]
        self.expected["planned_hf_change_db"] = round(float(np.mean(hf)), 3) if hf else 0.0
        self.expected["planned_low_end_change_db"] = round(float(np.mean(low)), 3) if low else 0.0


def _ramp(x: float, lo: float, hi: float) -> float:
    return float(np.clip((x - lo) / max(hi - lo, 1e-9), 0.0, 1.0))


def _bell_bandwidth_oct(q: float) -> float:
    # Inverse of q_for_bandwidth (RBJ bandwidth definition).
    return float(2.0 / np.log(2.0) * np.arcsinh(1.0 / (2.0 * max(q, 0.05))))


def _movement_weight(d: EQDecision) -> float:
    if d.filter_type == "bell":
        return float(np.clip(_bell_bandwidth_oct(d.q) / 2.0, 0.5, 1.5))
    return 1.0


# ---------------------------------------------------------------------------
# EQ
# ---------------------------------------------------------------------------


def _required_confidence(p: Problem) -> tuple[str, float]:
    if p.direction == "excess":
        return "cut", C.REQUIRED_CONFIDENCE["cut"]
    key = {"low": "boost_low", "mid": "boost_mid", "high": "boost_high"}[p.frequency_class or "mid"]
    return key, C.REQUIRED_CONFIDENCE[key]


def _eq_from_problem(p: Problem, profile: SourceProfile, sr: int) -> EQDecision:
    outside = float(p.evidence["outside_window_db"])
    lo_hz, hi_hz = float(p.evidence["lo_hz"]), float(p.evidence["hi_hz"])
    layout = profile.band_layout
    bottom, top = layout[0]["lo_hz"], layout[-1]["hi_hz"]
    if p.direction == "excess":
        gain = -min(C.EQ_MAX_CUT_DB, outside * C.EQ_CUT_FRACTION) * (0.5 + 0.5 * p.confidence)
    else:
        gain = min(C.EQ_MAX_BOOST_DB[p.frequency_class or "mid"], outside * C.EQ_BOOST_FRACTION) * p.confidence
        if (profile.clipping or {}).get("detected"):
            gain *= 0.7

    if p.direction == "excess" and lo_hz <= bottom * 1.01 and hi_hz <= 120.0:
        ftype, freq, q = "low_shelf", hi_hz * 0.9, 0.707
    elif hi_hz >= top * 0.99 and lo_hz >= 2000.0:
        # Only a cluster that genuinely reaches the top of the spectrum
        # earns a shelf; anything narrower is a bell.
        ftype, freq, q = "high_shelf", min(lo_hz * 1.15, sr * 0.4), 0.707
    else:
        center = max(float(p.center_hz), 35.0)
        ftype, freq, q = "bell", center, float(np.clip(q_for_bandwidth(float(p.bandwidth_oct) * 0.9), *C.EQ_Q_RANGE))
    reason = f"measured_{p.kind}" if p.direction == "excess" else f"measured_{p.kind}"
    return EQDecision(filter_type=ftype, frequency_hz=freq, gain_db=gain, q=q, confidence=p.confidence, reason=reason, problem=p.kind)


def _shrink(d: EQDecision, sr: int, note: str) -> None:
    if d.filter_type == "bell" and d.q < C.EQ_Q_RANGE[1]:
        d.q = min(C.EQ_Q_RANGE[1], d.q * 1.25)
        d.notes.append(f"narrowed (Q {d.q:.2f}): {note}")
    elif d.filter_type == "high_shelf" and d.frequency_hz * 1.1 < sr * 0.4 and d.frequency_hz < 16000.0:
        d.frequency_hz *= 1.1
        d.notes.append(f"corner raised to {d.frequency_hz:.0f} Hz: {note}")
    elif d.filter_type == "low_shelf" and d.frequency_hz * 0.9 > 30.0:
        d.frequency_hz *= 0.9
        d.notes.append(f"corner lowered to {d.frequency_hz:.0f} Hz: {note}")
    else:
        d.gain_db *= 0.75
        d.notes.append(f"gain reduced to {d.gain_db:+.2f} dB: {note}")


def _enforce_eq_constraints(decisions: list[EQDecision], profile: SourceProfile, context: TargetContext, problems: list[Problem], sr: int, eq_budget_db: float, notes: list) -> None:
    layout = profile.band_layout
    excess_bands, deficit_bands = set(), set()
    for p in problems:
        if p.category == "tonal" and p.bands and p.confidence >= C.REPORT_MIN_CONFIDENCE:
            (excess_bands if p.direction == "excess" else deficit_bands).update(p.bands)
    protect = [
        b["name"] for b in layout if C.LOW_END_PROTECT_RANGE_HZ[0] <= b["center_hz"] <= C.LOW_END_PROTECT_RANGE_HZ[1] and b["name"] not in excess_bands
    ]
    hf_names = [b["name"] for b in layout if b["center_hz"] >= C.HF_BUDGET_START_HZ]
    hf_budget = C.HF_BOOST_BUDGET_DB * context.hf_boost_multiplier

    for _ in range(12):
        auto = [d for d in decisions if d.source == "automatic" and abs(d.gain_db) >= 1e-3]
        if not auto:
            return
        resp = {id(d): band_response_db([d], layout, sr) for d in auto}
        total = {b["name"]: sum(resp[id(d)][b["name"]] for d in auto) for b in layout}
        changed = False

        # 1. never push a band the diagnosis flagged in the opposite direction
        for name in excess_bands:
            if total[name] > C.EQ_MAX_OPPOSING_BLEED_DB:
                for d in auto:
                    if resp[id(d)][name] > 0.05:
                        _shrink(d, sr, f"was adding {resp[id(d)][name]:+.2f} dB to excessive band {name}")
                        changed = True
        for name in deficit_bands:
            if total[name] < -C.EQ_MAX_OPPOSING_BLEED_DB:
                for d in auto:
                    if resp[id(d)][name] < -0.05:
                        _shrink(d, sr, f"was removing {resp[id(d)][name]:+.2f} dB from deficient band {name}")
                        changed = True
        # 2. protect healthy kick/bass fundamentals from neighbouring cuts
        for name in protect:
            if total[name] < -C.EQ_MAX_LOW_END_COLLATERAL_DB:
                for d in auto:
                    if resp[id(d)][name] < -0.05 and d.gain_db < 0:
                        _shrink(d, sr, f"low-end protection: {name} would lose {resp[id(d)][name]:.2f} dB")
                        changed = True
        if changed:
            continue
        # 3. cumulative HF boost budget, across every filter
        hf_boost = max((sum(max(0.0, resp[id(d)][n]) for d in auto if d.gain_db > 0) for n in hf_names), default=0.0)
        if hf_boost > hf_budget + 1e-3:
            scale = hf_budget / hf_boost
            for d in auto:
                if d.gain_db > 0 and any(resp[id(d)][n] > 0.05 for n in hf_names):
                    d.gain_db *= scale
                    d.notes.append(f"scaled x{scale:.2f} by cumulative HF boost budget ({hf_budget:.2f} dB)")
            notes.append(f"HF boost budget {hf_budget:.2f} dB enforced (requested {hf_boost:.2f} dB)")
            continue
        # 4. source-identity change budget: boosts give way first
        movement = sum(abs(d.gain_db) * _movement_weight(d) for d in auto)
        if movement > eq_budget_db + 1e-3:
            boosts = sum(abs(d.gain_db) * _movement_weight(d) for d in auto if d.gain_db > 0)
            excess = movement - eq_budget_db
            if boosts > 1e-6:
                bscale = max(0.0, 1.0 - excess / boosts)
                for d in auto:
                    if d.gain_db > 0:
                        d.gain_db *= bscale
                        d.notes.append(f"scaled x{bscale:.2f} by change budget ({eq_budget_db:.2f} dB)")
                excess = max(0.0, excess - boosts)
            cuts = movement - boosts
            if excess > 1e-6 and cuts > 1e-6:
                cscale = max(0.0, 1.0 - excess / cuts)
                for d in auto:
                    if d.gain_db < 0:
                        d.gain_db *= cscale
                        d.notes.append(f"scaled x{cscale:.2f} by change budget ({eq_budget_db:.2f} dB)")
            notes.append(f"EQ change budget {eq_budget_db:.2f} dB enforced (requested {movement:.2f} dB)")
            continue
        return


def _plan_eq(profile: SourceProfile, context: TargetContext, problems: list[Problem], sr: int, eq_budget_db: float, rejected: list, notes: list) -> list[EQDecision]:
    candidates = []
    for p in problems:
        if p.category != "tonal" or p.kind.startswith("sibilance") or not p.bands:
            continue
        gate_name, required = _required_confidence(p)
        if not p.actionable or p.confidence < required:
            rejected.append({"stage": "eq", "problem": p.kind, "reason": f"confidence {p.confidence:.2f} below {gate_name} gate {required:.2f}"})
            continue
        if p.direction == "deficit" and p.frequency_class == "high":
            src_hf = max(profile.harshness_score, profile.brightness_score)
            if src_hf >= 0.5:
                rejected.append({"stage": "eq", "problem": p.kind, "reason": f"HF boost blocked: source already bright/harsh vs neutral curve (score {src_hf:.2f})"})
                continue
        d = _eq_from_problem(p, profile, sr)
        if abs(d.gain_db) < C.EQ_MIN_NODE_GAIN_DB:
            rejected.append({"stage": "eq", "problem": p.kind, "reason": f"correction {d.gain_db:+.2f} dB below audibility floor"})
            continue
        candidates.append((p.severity * p.confidence, d))

    candidates.sort(key=lambda t: t[0], reverse=True)
    for _, d in candidates[C.EQ_MAX_AUTOMATED_NODES:]:
        rejected.append({"stage": "eq", "problem": d.problem, "reason": "exceeded max automated EQ nodes"})
    decisions = [d for _, d in candidates[: C.EQ_MAX_AUTOMATED_NODES]]
    _enforce_eq_constraints(decisions, profile, context, problems, sr, eq_budget_db, notes)
    kept = []
    for d in decisions:
        if abs(d.gain_db) < C.EQ_MIN_NODE_GAIN_DB:
            rejected.append({"stage": "eq", "problem": d.problem, "reason": f"reduced below audibility floor by constraints ({'; '.join(d.notes)})"})
        else:
            kept.append(d)
    return kept


def _plan_dynamic_eq(profile: SourceProfile, context: TargetContext, problems: list[Problem], eq_decisions: list[EQDecision], rejected: list) -> list[DynamicEQDecision]:
    """Dynamic EQ targets excess that FLARES (present in some segments,
    absent in others) — a static cut would dull the passages where it is
    fine. Centres come from the measured problem region, snapped to a
    measured persistent resonance when one lies within half an octave."""
    from ..analysis.spectral import fraction_above

    layout = profile.band_layout
    candidates = []
    for b in layout:
        if not (100.0 <= b["center_hz"] <= 9000.0):
            continue
        name = b["name"]
        pct = profile.segment_percentiles.get(name)
        if not pct:
            continue
        limit = context.tonal_target_db[name] + context.tolerance_high_db[name]
        frac_hot = fraction_above(pct, limit)
        p90_excess = float(pct.get("90", pct.get("90.0", 0.0))) - limit
        if 0.08 <= frac_hot <= 0.6 and p90_excess > 1.0:
            candidates.append((b, frac_hot, p90_excess))

    groups: list[list] = []
    for c in candidates:
        if groups and layout.index(c[0]) == layout.index(groups[-1][-1][0]) + 1:
            groups[-1].append(c)
        else:
            groups.append([c])

    decisions = []
    for g in groups:
        centers = np.array([c[0]["center_hz"] for c in g])
        excess = np.array([c[2] for c in g])
        center = float(np.exp(np.sum(excess * np.log(centers)) / np.sum(excess)))
        bw = float(np.log2(g[-1][0]["hi_hz"] / g[0][0]["lo_hz"]))
        confidence = _ramp(float(excess.max()), 1.0, 4.0) * _ramp(profile.segment_count, 4, 20) * 0.9 + 0.1 * _ramp(float(excess.max()), 1.0, 4.0)
        reason = f"intermittent excess around {center:.0f} Hz (hot in {np.mean([c[1] for c in g]) * 100:.0f}% of segments)"
        q = float(np.clip(q_for_bandwidth(bw), 1.0, 3.0))
        for r in profile.resonances:
            if abs(np.log2(r["center_hz"] / center)) <= 0.5:
                center, q = float(r["center_hz"]), max(q, 3.0)
                reason += f"; snapped to measured resonance at {center:.0f} Hz"
                break
        if confidence < C.REQUIRED_CONFIDENCE["dynamic_eq"]:
            rejected.append({"stage": "dynamic_eq", "problem": f"intermittent_{center:.0f}hz", "reason": f"confidence {confidence:.2f} below gate {C.REQUIRED_CONFIDENCE['dynamic_eq']:.2f}"})
            continue
        decisions.append(
            DynamicEQDecision(
                frequency_hz=center,
                q=q,
                max_reduction_db=float(np.clip(0.8 + 0.5 * float(excess.max()), 1.0, 3.0) * confidence),
                threshold_percentile=80.0,
                release_ms=120.0,
                confidence=confidence,
                reason=reason,
                problem=None,
            )
        )
    decisions.sort(key=lambda d: d.confidence * d.max_reduction_db, reverse=True)
    for d in decisions[3:]:
        rejected.append({"stage": "dynamic_eq", "problem": d.reason, "reason": "exceeded max dynamic EQ nodes (3)"})
    return decisions[:3]


# ---------------------------------------------------------------------------
# Dynamics / colour / stereo / loudness
# ---------------------------------------------------------------------------


def _release_ms(profile: SourceProfile, rejected_notes: list) -> tuple[float, str]:
    lo, hi = C.COMPRESSOR_RELEASE_RANGE_MS
    density = profile.transient_density
    if profile.tempo_bpm > 0 and profile.bpm_confidence >= C.BPM_MIN_CONFIDENCE:
        beat_ms = 60000.0 / profile.tempo_bpm
        # First musical subdivision (1/1, 1/2, 1/4 beat) inside the range.
        candidate = next((beat_ms / div for div in (2.0, 1.0, 4.0) if lo <= beat_ms / div <= hi), float(np.clip(beat_ms / 2.0, lo, hi)))
        release = candidate * (1.15 - 0.4 * density)
        basis = f"tempo {profile.tempo_bpm:.1f} BPM (confidence {profile.bpm_confidence:.2f}) -> {candidate:.0f} ms subdivision, x density factor"
    else:
        release = 300.0 - 180.0 * density
        basis = f"no reliable tempo (confidence {profile.bpm_confidence:.2f}); from transient density {density:.2f}"
    return float(np.clip(release, lo, hi)), basis


def _plan_compression(profile: SourceProfile, context: TargetContext, tier: str, change: dict, rejected: list) -> dict:
    need = calculate_compression_need(profile, context)
    micro, macro = need["micro_need"], need["macro_need"]
    transient_priority = float(context.preservation_priorities.get("transients", 0.75))
    low_priority = float(context.preservation_priorities.get("low_end_impact", 0.7))
    attack = C.COMPRESSOR_BASE_ATTACK_MS + C.COMPRESSOR_TRANSIENT_ATTACK_EXTRA_MS * profile.transient_health * transient_priority
    release, release_basis = _release_ms(profile, rejected)

    plan = {"need": need, "multiband": {"enabled": False}, "glue": {"enabled": False}, "enabled": False}
    if micro >= C.COMPRESSION_MIN_NEED:
        ratio = 1.0 + micro * (C.COMPRESSION_MAX_RATIO - 1.0)
        band_names = ("sub", "punch", "low_mid", "high_mid", "high") if tier == "professional" else ("low", "low_mid", "high_mid", "high")
        low_factor = 0.7 * (1.0 - 0.5 * profile.low_end_impact * low_priority)
        factors = {"sub": 0.4, "low": low_factor, "punch": low_factor, "low_mid": 1.0, "high_mid": 0.9, "high": 0.7}
        extra_attack = {"sub": 30.0, "low": 10.0, "punch": 10.0}
        bands = {
            n: {
                "ratio": round(1.0 + (ratio - 1.0) * factors[n], 3),
                "threshold_offset_db": round(8.0 - 4.0 * micro, 2),  # above the band's own RMS
                "attack_ms": round(attack + extra_attack.get(n, 0.0), 1),
                "release_ms": round(release * (1.4 if n in ("sub", "low") else 1.0), 1),
                "max_gain_reduction_db": round(1.5 + 3.0 * micro, 2),
            }
            for n in band_names
        }
        plan["multiband"] = {"enabled": True, "bands": bands, "reason": f"acceptable loudness out of limiter-only reach by {need['inputs']['loudness_shortfall_lu']:.1f} LU; micro-dynamics need {micro:.2f}", "release_basis": release_basis}
    else:
        rejected.append({"stage": "compression", "problem": "micro_dynamics", "reason": f"need {micro:.2f} below {C.COMPRESSION_MIN_NEED:.2f} (limiter alone reaches {need['inputs']['limiter_only_achievable_lufs']:.1f} LUFS vs acceptable min {context.acceptable_min_lufs:.1f}; transient health {profile.transient_health:.2f}; already-limited {profile.already_limited_score:.2f})"})
    if macro >= C.GLUE_MIN_NEED:
        plan["glue"] = {
            "enabled": True,
            "ratio": round(1.15 + 0.25 * macro, 3),
            "threshold_offset_db": round(4.0 - 2.0 * macro, 2),
            "attack_ms": round(attack + 20.0, 1),
            "release_ms": round(float(np.clip(release * 2.0, 200.0, 600.0)), 1),
            "reason": f"LRA {profile.lra_lu:.1f} LU; macro-dynamics need {macro:.2f}",
        }
    else:
        rejected.append({"stage": "glue_compression", "problem": "macro_dynamics", "reason": f"need {macro:.2f} below {C.GLUE_MIN_NEED:.2f} (LRA {profile.lra_lu:.1f} LU)"})
    plan["enabled"] = bool(plan["multiband"]["enabled"] or plan["glue"]["enabled"])
    plan["attack_basis"] = f"transient health {profile.transient_health:.2f} x priority {transient_priority:.2f} -> base attack {attack:.1f} ms"
    return plan


def _plan_deesser(profile: SourceProfile, context: TargetContext, problems: list[Problem], rejected: list) -> dict:
    sib = next((p for p in problems if p.kind == "sibilance"), None)
    required = C.REQUIRED_CONFIDENCE["deesser"] - 0.2 * context.deesser_intent
    if sib is None:
        return {"enabled": False, "reason": "no narrow-band temporal sibilance evidence"}
    if sib.confidence < required:
        rejected.append({"stage": "deesser", "problem": "sibilance", "reason": f"confidence {sib.confidence:.2f} below gate {required:.2f}"})
        return {"enabled": False, "reason": f"sibilance evidence too weak (confidence {sib.confidence:.2f})"}
    strength = float(np.clip(sib.severity * sib.confidence + 0.2 * context.deesser_intent, 0.0, C.DEESSER_MAX_STRENGTH))
    return {"enabled": strength > 0.02, "strength": round(strength, 3), "center_hz": round(float(sib.center_hz), 1), "q": 2.4, "confidence": round(sib.confidence, 3), "reason": f"sibilance bursts +{sib.evidence.get('jump_db', 0):.1f} dB around {sib.center_hz:.0f} Hz"}


def _plan_saturation(profile: SourceProfile, context: TargetContext, change: dict, rejected: list) -> dict:
    allowance = context.saturation_allowance
    hf_risk = max(profile.brightness_score, profile.harshness_score)
    transient_priority = float(context.preservation_priorities.get("transients", 0.75))
    factors = {
        "hf_suitability": 1.0 - _ramp(hf_risk, 0.2, C.SATURATION_HF_BLOCK_SCORE),
        "transient_protection": 1.0 - 0.7 * profile.transient_health * transient_priority,
        "not_already_limited": 1.0 - profile.already_limited_score,
        "not_clipped": 0.0 if (profile.clipping or {}).get("detected") else 1.0,
        # A healthy mix keeps its identity: colouration scales with how
        # much the source needs to change at all.
        "identity": 0.3 + 0.7 * change["change_budget"],
    }
    amount = allowance * float(np.prod(list(factors.values())))
    factors = {k: round(v, 3) for k, v in factors.items()}
    if amount < C.SATURATION_MIN_AMOUNT:
        rejected.append({"stage": "saturation", "problem": None, "reason": f"amount {amount:.3f} below {C.SATURATION_MIN_AMOUNT} (allowance {allowance:.3f}, factors {factors})"})
        return {"enabled": False, "amount": 0.0, "drive_db": 0.0, "allowance": round(allowance, 3), "factors": factors, "reason": "disabled: harmonic generation not justified for this source"}
    drive = float(min(C.SATURATION_MAX_DRIVE_DB, amount * C.SATURATION_DRIVE_PER_AMOUNT_DB))
    return {"enabled": True, "amount": round(amount, 4), "drive_db": round(drive, 3), "side_drive_scale": 0.3, "allowance": round(allowance, 3), "factors": factors, "reason": f"allowance {allowance:.3f} reduced by source risk factors"}


def _plan_stereo(profile: SourceProfile, context: TargetContext, problems: list[Problem], rejected: list) -> dict:
    kinds = {p.kind: p for p in problems}
    plan = {"lf_mono": {"enabled": False}, "side_gain_db": 0.0, "side_high_shelf_db": 0.0, "side_shelf_hz": 1500.0, "reasons": []}
    lf = kinds.get("excessive_low_frequency_stereo")
    if lf is not None and lf.actionable:
        cutoff = 80.0
        for b in profile.band_layout:
            if b["center_hz"] < 160.0 and profile.width_per_band.get(b["name"], 0.0) > C.LOW_END_WIDTH_LIMIT:
                cutoff = max(cutoff, min(160.0, b["hi_hz"]))
        plan["lf_mono"] = {"enabled": True, "cutoff_hz": cutoff, "reason": f"low-end width {profile.low_end_stereo_width:.2f} / correlation {profile.low_end_correlation:.2f}"}
    wide = kinds.get("excessive_width")
    narrow = kinds.get("overly_narrow_stereo")
    if wide is not None and wide.actionable:
        target = min(context.max_stereo_width, profile.stereo_width * 0.85)
        db = 20.0 * np.log10(max(target, 1e-3) / max(profile.stereo_width, 1e-3))
        plan["side_gain_db"] = round(float(np.clip(db, C.MAX_NARROW_DB, 0.0)), 3)
        plan["reasons"].append(f"narrowing: correlation {profile.stereo_correlation:.2f}, width {profile.stereo_width:.2f}")
    elif narrow is not None and narrow.actionable and profile.stereo_correlation > 0.5 and context.max_stereo_width > profile.stereo_width:
        upper = max(profile.mid_stereo_width, profile.high_stereo_width, 1e-3)
        db = 20.0 * np.log10(C.NARROW_WIDTH_LIMIT / upper) * narrow.confidence
        plan["side_high_shelf_db"] = round(float(np.clip(db, 0.0, C.MAX_WIDEN_DB)), 3)
        plan["reasons"].append(f"widening above {plan['side_shelf_hz']:.0f} Hz only: upper-band width {upper:.3f}")
    elif narrow is not None and not narrow.actionable:
        rejected.append({"stage": "stereo", "problem": narrow.kind, "reason": "near-mono source: nothing to widen"})
    plan["enabled"] = bool(plan["lf_mono"]["enabled"] or abs(plan["side_gain_db"]) > 1e-3 or abs(plan["side_high_shelf_db"]) > 1e-3)
    if not plan["enabled"]:
        plan["reasons"].append("stereo image within limits: no width processing")
    return plan


def _plan_loudness(profile: SourceProfile, context: TargetContext, limiter: dict, clipper: dict) -> dict:
    lufs = profile.integrated_lufs
    notes = []
    if lufs > context.acceptable_max_lufs:
        desired = max(context.acceptable_max_lufs, lufs + context.max_lufs_reduce_db)
        notes.append("source above acceptable range: reduce (bounded by the style's max reduction)")
    elif lufs >= context.preferred_lufs:
        # Already inside the range and at/above preferred: LUFS is a range,
        # not an exact destination — leave the level alone.
        desired = lufs
        notes.append("source already inside the acceptable range at/above preferred loudness: level unchanged")
    else:
        desired = context.preferred_lufs
    headroom_gain = C.LIMITER_CEILING_DBTP + limiter["budget_db"] + (clipper.get("share_db", 0.0) if clipper.get("enabled") else 0.0) - profile.peak_p995_db
    achievable = lufs + headroom_gain
    target = min(desired, achievable)
    constrained = achievable < desired - 0.05
    if constrained:
        notes.append(f"limited by limiter damage budget: achievable {achievable:.2f} LUFS < desired {desired:.2f}")
    if target < context.acceptable_min_lufs and lufs < context.acceptable_min_lufs:
        notes.append("landing below the acceptable range: accepted to preserve crest factor/transients")
    return {
        "source_lufs": round(lufs, 2),
        "preferred_lufs": context.preferred_lufs,
        "acceptable_min_lufs": context.acceptable_min_lufs,
        "acceptable_max_lufs": context.acceptable_max_lufs,
        "desired_lufs": round(desired, 2),
        "achievable_lufs_by_budget": round(achievable, 2),
        "target_lufs": round(target, 2),
        "constrained_by_limiter_budget": bool(constrained),
        "notes": notes,
    }


def _plan_limiter_and_clipper(profile: SourceProfile, context: TargetContext, rejected: list) -> tuple[dict, dict]:
    budget = calculate_limiter_budget(profile, context)
    tempo = profile.tempo_bpm if profile.tempo_bpm > 0 else 120.0
    beat_ms = 60000.0 / float(np.clip(tempo, 40.0, 220.0))
    release = float(np.clip(np.clip(beat_ms * 0.22, 50.0, 220.0) + np.clip((profile.crest_db - 8.0) * 3.0, -25.0, 30.0), 40.0, 250.0))
    transient_priority = float(context.preservation_priorities.get("transients", 0.75))
    # Loudness recovery (bus_processing) stops pushing once crest factor
    # would fall below this: the genre's master crest, raised by up to 3 dB
    # for sources with healthy transients in genres that prize them.
    crest_floor = context.target_crest_db + 3.0 * profile.transient_health * transient_priority
    limiter = {"ceiling_dbtp": C.LIMITER_CEILING_DBTP, "budget_db": budget["budget_db"], "budget_reasons": budget["reasons"], "release_ms": round(release, 1), "crest_floor_db": round(crest_floor, 2)}

    desired_gain = context.preferred_lufs - profile.integrated_lufs
    needed_gr = profile.peak_p995_db + desired_gain - C.LIMITER_CEILING_DBTP
    transient_risk = profile.transient_health * transient_priority
    allowed = bool(context.transient_safety.get("allow_clipper_bypass", True))
    if needed_gr > budget["budget_db"] + 0.3 and transient_risk < 0.45 and profile.already_limited_score < 0.5 and not (profile.clipping or {}).get("detected"):
        share = round(C.CLIPPER_MAX_SHARE_DB * (1.0 - profile.transient_health), 3)
        clipper = {"enabled": share > 0.1, "share_db": share, "reason": f"loudness needs {needed_gr:.1f} dB peak reduction > limiter budget {budget['budget_db']:.1f} dB; transient risk {transient_risk:.2f} low"}
    else:
        why = []
        if needed_gr <= budget["budget_db"] + 0.3:
            why.append("limiter budget sufficient")
        if transient_risk >= 0.45:
            why.append(f"transient risk {transient_risk:.2f}")
        if profile.already_limited_score >= 0.5:
            why.append("source already limited")
        if (profile.clipping or {}).get("detected"):
            why.append("input already clipped")
        clipper = {"enabled": False, "share_db": 0.0, "reason": "; ".join(why) or "not needed"}
        if not allowed:
            clipper["reason"] += " (genre disallows clipper bypass: kept off only because not needed)"
        rejected.append({"stage": "clipper", "problem": None, "reason": clipper["reason"]})
    return limiter, clipper


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


def build_mastering_plan(profile: SourceProfile, context: TargetContext, problems: list[Problem], tier: str = "standard") -> MasteringPlan:
    sr = profile.sample_rate
    rejected: list = []
    notes: list = list(context.intent_notes)
    change = calculate_change_budget(profile, problems)

    eq = _plan_eq(profile, context, problems, sr, change["eq_budget_db"], rejected, notes)
    dyn_eq = _plan_dynamic_eq(profile, context, problems, eq, rejected)
    compression = _plan_compression(profile, context, tier, change, rejected)
    deesser = _plan_deesser(profile, context, problems, rejected)
    saturation = _plan_saturation(profile, context, change, rejected)
    stereo = _plan_stereo(profile, context, problems, rejected)
    limiter, clipper = _plan_limiter_and_clipper(profile, context, rejected)
    loudness = _plan_loudness(profile, context, limiter, clipper)

    plan = MasteringPlan(
        sample_rate=sr,
        tier=tier,
        source_state={
            "integrated_lufs": profile.integrated_lufs,
            "true_peak_db": profile.true_peak_db,
            "crest_db": profile.crest_db,
            "short_term_crest_db": profile.short_term_crest_db,
            "plr_db": profile.plr_db,
            "lra_lu": profile.lra_lu,
            "transient_health": profile.transient_health,
            "dynamic_health_score": profile.dynamic_health_score,
            "already_limited_score": profile.already_limited_score,
            "stereo_width": profile.stereo_width,
            "stereo_correlation": profile.stereo_correlation,
            "scores": {k: getattr(profile, k) for k in ("mud_score", "boom_score", "thinness_score", "harshness_score", "sibilance_score", "brightness_score", "dullness_score")},
        },
        detected_problems=problems_to_dict(problems),
        target_context=context.to_dict(),
        eq_decisions=eq,
        dynamic_eq_decisions=dyn_eq,
        compression=compression,
        deesser=deesser,
        saturation=saturation,
        stereo=stereo,
        clipper=clipper,
        limiter=limiter,
        loudness=loudness,
        change_budget=change,
        band_layout=profile.band_layout,
        rejected_decisions=rejected,
        notes=notes,
    )
    plan.expected["max_crest_loss_db"] = round(
        limiter["budget_db"] + (clipper["share_db"] if clipper["enabled"] else 0.0) + (compression["multiband"]["bands"][next(iter(compression["multiband"]["bands"]))]["max_gain_reduction_db"] if compression["multiband"]["enabled"] else 0.0),
        3,
    )
    plan.refresh_expected()
    return plan


def apply_user_tweaks_to_plan(plan: MasteringPlan, tweaks: dict) -> MasteringPlan:
    """Explicit user slider values become explicit, labelled decisions
    (source="user_tweak", confidence 1.0). They are the user's request, not
    an automated inference, so they bypass the confidence gates — but they
    stay hard-bounded and are reported next to any conflict with the
    diagnosis."""
    plan.eq_decisions = [d for d in plan.eq_decisions if d.source != "user_tweak"]
    t = {k: float(np.clip(float(tweaks.get(k, 0.0) or 0.0), -1.0, 1.0)) for k in ("low_end", "punch", "presence", "brightness", "warmth", "width", "loudness")}
    plan.user_tweaks = t

    def add(ftype, freq, gain, q, why):
        if abs(gain) >= 0.05:
            plan.eq_decisions.append(EQDecision(filter_type=ftype, frequency_hz=freq, gain_db=gain, q=q, confidence=1.0, reason=why, source="user_tweak"))

    add("low_shelf", 100.0, t["low_end"] * 1.2, 0.707, "user_tweak_low_end")
    add("bell", 250.0, t["warmth"] * 0.8, 0.8, "user_tweak_warmth")
    add("high_shelf", 10000.0, -t["warmth"] * 0.25, 0.707, "user_tweak_warmth_top")
    add("bell", 3000.0, t["presence"] * 0.8, 0.9, "user_tweak_presence")
    add("high_shelf", 8000.0, t["brightness"] * 0.8, 0.707, "user_tweak_brightness")

    excess = {b for p in plan.detected_problems.values() if p.get("direction") == "excess" for b in p.get("bands", [])}
    for d in plan.eq_decisions:
        if d.source == "user_tweak" and d.gain_db > 0:
            leak = band_response_db([d], plan.band_layout, plan.sample_rate)
            hit = [b for b in excess if leak.get(b, 0.0) > 0.3]
            if hit:
                d.notes.append(f"user boost adds energy to bands diagnosed as excessive: {sorted(hit)}")

    if abs(t["punch"]) > 1e-3 and plan.compression["multiband"].get("enabled"):
        for name, band in plan.compression["multiband"]["bands"].items():
            if name in ("low", "punch", "low_mid"):
                band["ratio"] = round(float(np.clip(band["ratio"] - t["punch"] * 0.18, 1.0, C.COMPRESSION_MAX_RATIO)), 3)
                band["attack_ms"] = round(float(band["attack_ms"] + t["punch"] * 10.0), 1)
    if abs(t["width"]) > 1e-3:
        plan.stereo["user_side_gain_db"] = round(t["width"] * 0.7, 3)
        plan.stereo["enabled"] = True
    if abs(t["loudness"]) > 1e-3:
        shift = t["loudness"] * 1.25
        lo = plan.loudness
        lo["user_shift_lu"] = round(shift, 3)
        lo["desired_lufs"] = round(lo["desired_lufs"] + shift, 2)
        lo["target_lufs"] = round(min(lo["desired_lufs"], lo["achievable_lufs_by_budget"] + max(0.0, shift) * 0.5), 2)
    plan.refresh_expected()
    return plan
