"""MasterVerdict: the ONE deliverability decision for a rendered candidate.

Three checkers look at a render, each from a different angle:

* evaluate_master   — hi-res, plan-aware: did processing move the tonal
                      balance / dynamics beyond what was planned, and which
                      stage did it (stage attribution);
* run_quality_control — technical integrity of the deliverable: clipping,
                      true peak, PLR, max limiter GR, phase, silence, DC;
* validate_render   — independent 9-band cross-check at matched loudness,
                      with the planned EQ removed (unplanned movement) plus
                      absolute caps that hold even if the PLAN was wrong.

Previously each one was consulted at a different point of the pipeline and
the last one only after the WAV was written, so a master could pass one
and fail another and still be delivered. Here they are folded into a single
verdict: a candidate is deliverable only if none of them reports a
blocking failure. Every failure is normalised to the same shape so the
corrective re-render (evaluation/backoff.py) can act on any of them.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from ..planning import config as C

# Domain each failure kind belongs to — the verdict reports pass/fail per
# domain so "what failed" is answerable without reading every flag.
_DOMAIN = {
    "low_end_loss": "tonal",
    "hf_growth": "tonal",
    "high_frequency_boost": "tonal",
    "band_collateral": "tonal",
    "excessive_band_change": "tonal",
    "tilt_drift": "tonal",
    "limiter_over_budget": "dynamics",
    "crest_collapse": "dynamics",
    "lra_collapse": "dynamics",
    "limiter_gain_reduction": "dynamics",
    "dynamics_preservation": "dynamics",
    "plr": "dynamics",
    "transient_loss": "transients",
    "unsafe_correlation": "stereo",
    "phase_correlation": "stereo",
    "true_peak_over_ceiling": "true_peak",
    "true_peak": "true_peak",
    "clipping": "integrity",
    "rendering_integrity": "integrity",
    "output_silence": "integrity",
    "channel_balance": "integrity",
    "loudness_target_missed": "loudness",
}
DOMAINS = ("tonal", "dynamics", "transients", "stereo", "true_peak", "loudness", "integrity")

# Failure kinds a re-render can plausibly fix by reducing processing.
# Anything else (NaN output, a silent render, a source that is itself out
# of phase) is not made better by doing less.
CORRECTABLE = {
    "low_end_loss", "hf_growth", "high_frequency_boost", "band_collateral", "excessive_band_change", "tilt_drift",
    "limiter_over_budget", "crest_collapse", "lra_collapse", "limiter_gain_reduction", "dynamics_preservation", "plr",
    "transient_loss", "unsafe_correlation", "loudness_target_missed",
}


@dataclass
class VerdictIssue:
    source: str              # evaluation | quality_control | guardrail
    kind: str
    domain: str
    measured: float | None
    limit: float | None
    blamed_stage: str | None
    detail: str
    # How many dB of dynamics relief the failure asks for (dynamics /
    # transient domain only) — drives the corrective ladder in backoff.py.
    relief_db: float = 0.0
    # Guardrail failures: "unplanned" movement or "total" (absolute cap).
    basis: str = "unplanned"


@dataclass
class MasterVerdict:
    passed: bool
    failures: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    domains: dict = field(default_factory=dict)
    loudness: dict = field(default_factory=dict)

    @property
    def correctable(self) -> bool:
        return bool(self.failures) and all(f.kind in CORRECTABLE for f in self.failures)

    def failures_in(self, *domains: str) -> list:
        return [f for f in self.failures if f.domain in domains]

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "correctable": self.correctable,
            "domains": dict(self.domains),
            "failures": [asdict(f) for f in self.failures],
            "warnings": [asdict(w) for w in self.warnings],
            "loudness": dict(self.loudness),
        }


def _relief_for(kind: str, measured, limit) -> float:
    """dB of peak-reduction relief a dynamics failure asks for. Measured
    where the checker gives a dB overshoot; a fixed nominal step where it
    doesn't (transient score / LRA aren't in dB)."""
    try:
        m, lim = float(measured), float(limit)
    except (TypeError, ValueError):
        return C.RECOVERY_NOMINAL_RELIEF_DB
    if kind in ("limiter_over_budget", "crest_collapse", "limiter_gain_reduction", "dynamics_preservation"):
        return max(m - lim, 0.0) + C.RECOVERY_RELIEF_MARGIN_DB
    if kind == "plr":
        return max(lim - m, 0.0) + C.RECOVERY_RELIEF_MARGIN_DB
    return C.RECOVERY_NOMINAL_RELIEF_DB


# Thresholds at which a QC "value" stops passing — QC reports only the value
# and a status, the verdict needs the limit to size the correction.
_QC_FAIL_LIMITS = {"limiter_gain_reduction": 6.0, "dynamics_preservation": 9.0, "plr": 4.0}


def build_verdict(evaluation, quality_control: dict, guardrails, requested_target_lufs: float, effective_target_lufs: float) -> MasterVerdict:
    failures: list[VerdictIssue] = []
    warnings: list[VerdictIssue] = []

    for f in evaluation.flags:
        kind = f["kind"]
        issue = VerdictIssue(
            source="evaluation",
            kind=kind,
            domain=_DOMAIN.get(kind, "tonal"),
            measured=f.get("measured"),
            limit=f.get("limit"),
            blamed_stage=f.get("blamed_stage"),
            detail=f.get("detail", ""),
        )
        if issue.domain in ("dynamics", "transients"):
            issue.relief_db = _relief_for(kind, issue.measured, issue.limit)
        blocking = kind in ("clipping", "true_peak_over_ceiling") or f["severity"] >= C.BACKOFF_MIN_SEVERITY
        (failures if blocking else warnings).append(issue)

    for c in quality_control.get("checks", []):
        if c["status"] == "pass":
            continue
        kind = c["id"]
        issue = VerdictIssue(
            source="quality_control",
            kind=kind,
            domain=_DOMAIN.get(kind, "integrity"),
            measured=c.get("value"),
            limit=_QC_FAIL_LIMITS.get(kind),
            blamed_stage="bus" if kind in _QC_FAIL_LIMITS else None,
            detail=c["message"],
        )
        if issue.domain in ("dynamics", "transients"):
            issue.relief_db = _relief_for(kind, issue.measured, issue.limit)
        (failures if c["status"] == "fail" else warnings).append(issue)

    for g in guardrails.failures:
        issue = VerdictIssue(
            source="guardrail",
            kind=g.name,
            domain=_DOMAIN.get(g.name, "tonal"),
            measured=g.measured,
            limit=g.limit,
            blamed_stage=g.blame_stage,
            detail=g.detail,
            basis=g.basis,
        )
        if issue.domain in ("dynamics", "transients"):
            issue.relief_db = _relief_for(g.name, issue.measured, issue.limit)
        failures.append(issue)

    lufs = float(evaluation.loudness["integrated_lufs"])
    shortfall = round(float(requested_target_lufs) - lufs, 2)
    loudness = {
        "integrated_lufs": round(lufs, 2),
        "requested_target_lufs": round(float(requested_target_lufs), 2),
        "effective_target_lufs": round(float(effective_target_lufs), 2),
        "shortfall_vs_requested_lu": shortfall,
    }
    if shortfall > C.LOUDNESS_SHORTFALL_WARN_LU:
        # Not a failure: landing quieter than asked is the engine protecting
        # the source. But it is reported, never silent.
        warnings.append(
            VerdictIssue(
                source="verdict",
                kind="loudness_below_request",
                domain="loudness",
                measured=round(lufs, 2),
                limit=round(float(requested_target_lufs), 2),
                blamed_stage=None,
                detail=f"delivered {lufs:.1f} LUFS, {shortfall:.1f} LU below the requested {requested_target_lufs:.1f} LUFS to stay inside this track's dynamics budget",
            )
        )

    domains = {d: ("fail" if any(f.domain == d for f in failures) else "warn" if any(w.domain == d for w in warnings) else "pass") for d in DOMAINS}
    return MasterVerdict(passed=not failures, failures=failures, warnings=warnings, domains=domains, loudness=loudness)
