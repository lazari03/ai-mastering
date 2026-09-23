"""Problem detection: turn a SourceProfile + TargetContext into an explicit
list of measured problems, each with severity, confidence and evidence.

Detection never produces processing. It answers only "what is measurably
wrong with this recording, relative to the acceptable destination, and how
sure are we?" A healthy source returns few or no actionable problems.

Tonal detection works on contiguous CLUSTERS of hi-res bands that sit
outside the tolerance window in the same direction, so e.g. "160-300 Hz
excessive" and "55-90 Hz healthy" stay two different facts instead of one
blended "bass" number.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from ..analysis.profile import SourceProfile
from ..analysis.spectral import fraction_above, fraction_below
from ..planning import config as C
from ..planning.budgets import calculate_limiter_budget, limiter_only_achievable_lufs
from ..planning.target_model import TargetContext

# (upper centre Hz, name if excess, name if deficit, frequency class)
_TONAL_REGIONS = (
    (55.0, "excessive_sub", "insufficient_sub", "low"),
    (110.0, "excessive_bass", "insufficient_bass", "low"),
    (250.0, "boomy_upper_bass", "thin_body", "low"),
    (550.0, "muddy_low_mids", "thin_body", "mid"),
    (1200.0, "boxiness", "hollow_midrange", "mid"),
    (2400.0, "excessive_midrange", "recessed_midrange", "mid"),
    (5500.0, "harsh_upper_mids", "insufficient_presence", "high"),
    (8000.0, "harsh_high_mids", "insufficient_presence", "high"),
    (10500.0, "excessive_cymbal_energy", "dull_highs", "high"),
    (14000.0, "excessive_brightness", "dull_highs", "high"),
    (1e9, "excessive_air", "insufficient_air", "high"),
)


def _region_for(center_hz: float) -> tuple[str, str, str]:
    for upper, excess, deficit, cls in _TONAL_REGIONS:
        if center_hz < upper:
            return excess, deficit, cls
    return _TONAL_REGIONS[-1][1:]


@dataclass
class Problem:
    kind: str
    category: str                  # tonal | dynamics | stereo | loudness | integrity
    severity: float
    confidence: float
    evidence: dict = field(default_factory=dict)
    direction: str | None = None   # excess | deficit (tonal)
    center_hz: float | None = None
    bandwidth_oct: float | None = None
    q: float | None = None
    measured_deviation_db: float | None = None
    bands: list = field(default_factory=list)
    frequency_class: str | None = None  # low | mid | high (tonal)
    actionable: bool = True

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("severity", "confidence", "center_hz", "bandwidth_oct", "q", "measured_deviation_db"):
            if isinstance(d.get(k), float):
                d[k] = round(d[k], 3)
        return d


def _ramp(x: float, lo: float, hi: float) -> float:
    return float(np.clip((x - lo) / max(hi - lo, 1e-9), 0.0, 1.0))


def tonal_deviation(profile: SourceProfile, context: TargetContext) -> dict:
    """Per band: measured - target, and how far outside the window."""
    out = {}
    for b in profile.band_layout:
        name = b["name"]
        if name not in context.tonal_target_db:
            continue
        dev = float(profile.spectral_bands[name] - context.tonal_target_db[name])
        tol_hi = context.tolerance_high_db[name]
        tol_lo = context.tolerance_low_db[name]
        if dev > tol_hi:
            outside = dev - tol_hi
        elif dev < -tol_lo:
            outside = dev + tol_lo
        else:
            outside = 0.0
        out[name] = {"deviation_db": dev, "outside_db": outside, "tol_high": tol_hi, "tol_low": tol_lo}
    return out


def _band_reliability(profile: SourceProfile, band: dict, direction: str) -> float:
    rel = min(1.0, band.get("fft_bins", C.MIN_RELIABLE_BINS) / float(C.MIN_RELIABLE_BINS))
    if profile.band_levels_db.get(band["name"], 0.0) < -100.0:
        rel *= 0.3  # essentially no content — deviation is noise-floor arithmetic
    cutoff = profile.codec_cutoff_hz
    if cutoff and band["lo_hz"] >= cutoff * 0.98 and direction == "deficit":
        # Content above an encoder's low-pass was removed, not mixed quiet;
        # boosting it only raises codec noise.
        rel *= 0.15
    return float(rel)


def _detect_tonal(profile: SourceProfile, context: TargetContext) -> list[Problem]:
    dev = tonal_deviation(profile, context)
    layout = [b for b in profile.band_layout if b["name"] in dev]
    signs = [int(np.sign(dev[b["name"]]["outside_db"])) for b in layout]

    # Contiguous same-sign clusters; a single in-window band whose raw
    # deviation still leans the same way (>= half its tolerance) bridges a
    # gap so one broad problem is not reported as two fragments.
    clusters: list[list[int]] = []
    i = 0
    while i < len(layout):
        if signs[i] == 0:
            i += 1
            continue
        s = signs[i]
        members = [i]
        j = i + 1
        while j < len(layout):
            if signs[j] == s:
                members.append(j)
                j += 1
                continue
            if signs[j] == 0 and j + 1 < len(layout) and signs[j + 1] == s:
                d = dev[layout[j]["name"]]
                lean = d["deviation_db"] * s
                if lean >= 0.5 * (d["tol_high"] if s > 0 else d["tol_low"]):
                    members.extend([j, j + 1])
                    j += 2
                    continue
            break
        clusters.append(members)
        i = j

    problems: list[Problem] = []
    for members in clusters:
        bands = [layout[k] for k in members]
        s = signs[members[0]]
        direction = "excess" if s > 0 else "deficit"
        octs = np.array([np.log2(b["hi_hz"] / b["lo_hz"]) for b in bands])
        outside = np.array([abs(dev[b["name"]]["outside_db"]) for b in bands])
        raw = np.array([dev[b["name"]]["deviation_db"] for b in bands])
        mean_outside = float(np.sum(outside * octs) / np.sum(octs))
        mean_dev = float(np.sum(raw * octs) / np.sum(octs))
        weights = np.maximum(outside, 1e-3) * octs
        center = float(np.exp(np.sum(weights * np.log([b["center_hz"] for b in bands])) / np.sum(weights)))
        lo_edge, hi_edge = bands[0]["lo_hz"], bands[-1]["hi_hz"]
        bandwidth = float(np.log2(hi_edge / lo_edge))

        # Persistence: fraction of ~1.5 s segments in which the band sits
        # beyond half its tolerance in the same direction.
        pers = []
        for b in bands:
            name = b["name"]
            target = context.tonal_target_db[name]
            pct = profile.segment_percentiles.get(name)
            if not pct:
                pers.append(0.5)
                continue
            if direction == "excess":
                pers.append(fraction_above(pct, target + 0.5 * context.tolerance_high_db[name]))
            else:
                pers.append(fraction_below(pct, target - 0.5 * context.tolerance_low_db[name]))
        persistence = float(np.sum(np.array(pers) * octs) / np.sum(octs))
        if profile.segment_count < 4:
            persistence = min(persistence, 0.6)  # too short to establish persistence
        reliability = float(np.mean([_band_reliability(profile, b, direction) for b in bands]))

        magnitude_conf = 1.0 - float(np.exp(-mean_outside / C.CONFIDENCE_MAGNITUDE_SCALE_DB))
        confidence = reliability * magnitude_conf * ((1.0 - C.CONFIDENCE_PERSISTENCE_WEIGHT) + C.CONFIDENCE_PERSISTENCE_WEIGHT * persistence)
        severity = float(np.clip(mean_outside / C.SEVERITY_FULL_SCALE_DB, 0.0, 1.0))
        excess_name, deficit_name, cls = _region_for(center)
        problems.append(
            Problem(
                kind=excess_name if direction == "excess" else deficit_name,
                category="tonal",
                severity=severity,
                confidence=float(np.clip(confidence, 0.0, 1.0)),
                direction=direction,
                center_hz=center,
                bandwidth_oct=bandwidth,
                measured_deviation_db=mean_dev,
                bands=[b["name"] for b in bands],
                frequency_class=cls,
                evidence={
                    "outside_window_db": round(mean_outside, 3),
                    "persistence": round(persistence, 3),
                    "reliability": round(reliability, 3),
                    "lo_hz": lo_edge,
                    "hi_hz": hi_edge,
                    "per_band_deviation_db": {b["name"]: round(dev[b["name"]]["deviation_db"], 2) for b in bands},
                },
            )
        )
    return problems


def detect_mastering_problems(profile: SourceProfile, context: TargetContext) -> list[Problem]:
    problems = _detect_tonal(profile, context)
    pr = context.preservation_priorities

    # --- sibilance (temporal, narrow-band evidence — NOT "HF is high") ---
    sib = profile.sibilance or {}
    if float(sib.get("score", 0.0)) > 0.02:
        conf = _ramp(float(sib.get("jump_db", 0.0)), 4.0, 10.0) * float(np.clip(1.2 - float(sib.get("centred_ratio", 1.0)) * 2.0, 0.3, 1.0))
        problems.append(
            Problem(
                kind="sibilance",
                category="tonal",
                severity=float(sib["score"]),
                confidence=conf,
                center_hz=float(sib.get("center_hz", 6500.0)),
                evidence={k: sib[k] for k in ("jump_db", "event_fraction", "centred_ratio") if k in sib},
                frequency_class="high",
            )
        )

    # --- integrity ---------------------------------------------------------
    clip = profile.clipping or {}
    if clip.get("detected"):
        problems.append(
            Problem(
                kind="clipping",
                category="integrity",
                severity=float(np.clip(clip.get("clipped_runs", 0) / 50.0, 0.2, 1.0)),
                confidence=0.95,
                evidence=clip,
                actionable=False,  # cannot be undone; informs every gain decision downstream
            )
        )
    if profile.true_peak_db > -0.3 and not clip.get("detected"):
        problems.append(
            Problem(kind="insufficient_headroom", category="integrity", severity=_ramp(profile.true_peak_db, -0.3, 1.0), confidence=0.9, evidence={"true_peak_db": profile.true_peak_db}, actionable=False)
        )

    # --- dynamics ----------------------------------------------------------
    if profile.already_limited_score > 0.3:
        problems.append(
            Problem(
                kind="over_compression",
                category="dynamics",
                severity=profile.already_limited_score,
                confidence=float(np.clip(0.5 + 0.5 * profile.already_limited_score, 0.0, 1.0)),
                evidence={"plr_db": profile.plr_db, "short_term_crest_db": profile.short_term_crest_db, "true_peak_db": profile.true_peak_db},
                actionable=False,  # mastering cannot restore dynamics; it can only avoid adding pressure
            )
        )
    # "Too dynamic" is judged against the destination: can the ACCEPTABLE
    # loudness range be reached with the limiter inside its damage budget?
    # (A pre-master's crest factor is always far above a master's, so a
    # raw crest comparison would flag every upload.) Wide LRA is the
    # macro-dynamics half of the same question.
    limiter_budget = calculate_limiter_budget(profile, context)["budget_db"]
    achievable = limiter_only_achievable_lufs(profile, context, limiter_budget)
    shortfall = context.acceptable_min_lufs - achievable
    if shortfall > 0.0 or profile.lra_lu > C.GLUE_LRA_RANGE_LU[0]:
        sev = max(_ramp(shortfall, *C.COMPRESSION_LOUDNESS_SHORTFALL_RANGE_LU), _ramp(profile.lra_lu, *C.GLUE_LRA_RANGE_LU))
        problems.append(
            Problem(
                kind="excessive_dynamic_range",
                category="dynamics",
                severity=sev,
                confidence=float(np.clip(0.5 + 0.4 * profile.transient_density + 0.1 * (profile.duration_s > 30.0), 0.0, 0.95)),
                evidence={"limiter_only_achievable_lufs": round(achievable, 2), "acceptable_min_lufs": context.acceptable_min_lufs, "limiter_budget_db": limiter_budget, "lra_lu": profile.lra_lu, "crest_db": profile.crest_db},
            )
        )
    if profile.transient_density > 0.2 and profile.transient_strength < 0.25:
        problems.append(
            Problem(
                kind="weak_transients",
                category="dynamics",
                severity=_ramp(0.25 - profile.transient_strength, 0.0, 0.2),
                confidence=0.6,
                evidence={"transient_strength": profile.transient_strength, "transient_density": profile.transient_density},
                actionable=False,  # informs compression/limiter caution; no transient designer in the chain
            )
        )
    peak_over_loudness = profile.peak_p995_db - profile.integrated_lufs
    if peak_over_loudness > 14.0:
        problems.append(
            Problem(
                kind="dangerous_transient_peaks",
                category="dynamics",
                severity=_ramp(peak_over_loudness, 14.0, 22.0),
                confidence=0.75,
                evidence={"peak_p995_db": profile.peak_p995_db, "integrated_lufs": profile.integrated_lufs},
                actionable=False,  # handled by the limiter budget / loudness plan, not by reshaping the mix
            )
        )

    # --- loudness ----------------------------------------------------------
    if profile.integrated_lufs > context.acceptable_max_lufs:
        problems.append(
            Problem(
                kind="excessive_loudness",
                category="loudness",
                severity=_ramp(profile.integrated_lufs - context.acceptable_max_lufs, 0.0, 4.0),
                confidence=0.95,
                evidence={"integrated_lufs": profile.integrated_lufs, "acceptable_max_lufs": context.acceptable_max_lufs},
            )
        )
    elif profile.integrated_lufs < context.acceptable_min_lufs:
        problems.append(
            Problem(
                kind="below_loudness_range",
                category="loudness",
                severity=_ramp(context.acceptable_min_lufs - profile.integrated_lufs, 0.0, 10.0),
                confidence=0.95,
                evidence={"integrated_lufs": profile.integrated_lufs, "acceptable_min_lufs": context.acceptable_min_lufs},
            )
        )

    # --- stereo ------------------------------------------------------------
    low_energy_present = any(
        profile.band_levels_db.get(b["name"], -120.0) > -80.0 for b in profile.band_layout if b["center_hz"] < 120.0
    )
    if low_energy_present and (profile.low_end_stereo_width > C.LOW_END_WIDTH_LIMIT or profile.low_end_correlation < C.LOW_END_CORRELATION_LIMIT):
        sev = max(_ramp(profile.low_end_stereo_width, C.LOW_END_WIDTH_LIMIT, 0.6), _ramp(C.LOW_END_CORRELATION_LIMIT - profile.low_end_correlation, 0.0, 0.6))
        problems.append(
            Problem(
                kind="excessive_low_frequency_stereo",
                category="stereo",
                severity=sev,
                confidence=0.85,
                evidence={"low_end_width": profile.low_end_stereo_width, "low_end_correlation": profile.low_end_correlation},
            )
        )
    if profile.stereo_correlation < C.EXCESS_WIDTH_CORRELATION or profile.stereo_width > context.max_stereo_width:
        problems.append(
            Problem(
                kind="excessive_width",
                category="stereo",
                severity=max(_ramp(C.EXCESS_WIDTH_CORRELATION - profile.stereo_correlation, 0.0, 0.5), _ramp(profile.stereo_width - context.max_stereo_width, 0.0, 0.5)),
                confidence=0.8,
                evidence={"correlation": profile.stereo_correlation, "width": profile.stereo_width, "max_width": context.max_stereo_width},
            )
        )
    upper_width = max(profile.mid_stereo_width, profile.high_stereo_width)
    if upper_width < C.NARROW_WIDTH_LIMIT:
        problems.append(
            Problem(
                kind="overly_narrow_stereo",
                category="stereo",
                severity=_ramp(C.NARROW_WIDTH_LIMIT - upper_width, 0.0, C.NARROW_WIDTH_LIMIT),
                confidence=0.6 * (1.0 - 0.5 * float(pr.get("stereo_image", 0.7))),
                evidence={"mid_width": profile.mid_stereo_width, "high_width": profile.high_stereo_width, "near_mono": profile.near_mono},
                # A (near-)mono source has nothing to widen — reported, not processed.
                actionable=not profile.near_mono,
            )
        )

    # De-duplicate kinds (two separate "thin_body" clusters, etc.).
    seen: dict[str, int] = {}
    for p in problems:
        if p.kind in seen:
            seen[p.kind] += 1
            p.kind = f"{p.kind}_{seen[p.kind]}"
        else:
            seen[p.kind] = 1
        if p.confidence < C.REPORT_MIN_CONFIDENCE or p.severity <= 0.0:
            p.actionable = False
    return problems


def problems_to_dict(problems: list[Problem]) -> dict:
    return {p.kind: p.to_dict() for p in problems}
