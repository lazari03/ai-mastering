"""Post-master evaluation: SOURCE vs MASTER vs PLAN.

The question is not "did we hit the target?" but "did the planned
corrections improve the measured problems without collateral damage?".

Expected vs actual
------------------
Every band change is measured LEVEL-MATCHED (the broadband level change,
taken over the same 300 Hz - 3 kHz reference region the relative spectrum
uses, is removed), on the same hi-res bands the plan used. The plan
predicted the EQ's contribution exactly (processing/eq.py is shared), so

    collateral = actual change - planned EQ change

is what compression, saturation, stereo processing, clipping and limiting
did to the tonal balance on top of what was intended. Per-stage
measurements from the renderer attribute it to the responsible stage.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from ..analysis.profile import SourceProfile
from ..audio_utils import _transient_metrics
from ..diagnostics.problems import tonal_deviation
from ..planning import config as C
from ..planning.plan import MasteringPlan
from ..planning.target_model import TargetContext

LOW_REGION_HZ = C.LOW_END_PROTECT_RANGE_HZ
HF_REGION_HZ = (4000.0, 14000.0)


@dataclass
class MasterEvaluation:
    band_change_db: dict
    expected_band_change_db: dict
    collateral_db: dict
    regions: dict
    dynamics: dict
    transients: dict
    loudness: dict
    true_peak_db: float
    clipping: bool
    stereo: dict
    limiter: dict
    problem_outcomes: dict
    stage_contributions: dict
    flags: list = field(default_factory=list)
    collateral_score: float = 0.0
    passed: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


def _mean_over(values: dict, layout: list[dict], lo: float, hi: float, skip: set | None = None) -> float:
    sel = [values[b["name"]] for b in layout if lo <= b["center_hz"] < hi and b["name"] in values and (not skip or b["name"] not in skip)]
    return float(np.mean(sel)) if sel else 0.0


def _tonal_delta(before: dict, after: dict, layout: list[dict]) -> dict:
    """Per-band level change with the broadband level change removed.

    Matched on the same 300 Hz - 3 kHz reference region the relative
    spectrum is normalised on (not on LUFS): after limiting, LUFS gating
    admits more quiet blocks, which shifts LUFS by ~0.5 dB relative to
    band power and would show up as a fake uniform "tilt" in every band."""
    raw = {b["name"]: after[b["name"]] - before[b["name"]] for b in layout if b["name"] in before and b["name"] in after}
    ref = [raw[b["name"]] for b in layout if b["name"] in raw and C.RELATIVE_REF_LOW_HZ <= b["center_hz"] <= C.RELATIVE_REF_HIGH_HZ]
    offset = float(np.mean(ref)) if ref else 0.0
    return {k: v - offset for k, v in raw.items()}


def _stage_contributions(stage_measurements: list[dict], plan: MasteringPlan) -> dict:
    """Tonal (level-matched) band change introduced by each stage that ran."""
    out = {}
    layout = plan.band_layout
    eq_expected = _match_expected(plan.expected.get("eq_band_change_db", {}), layout)
    for prev, cur in zip(stage_measurements[:-1], stage_measurements[1:]):
        delta = _tonal_delta(prev["band_levels_db"], cur["band_levels_db"], layout)
        unexpected = dict(delta)
        if cur["stage"] == "eq":
            unexpected = {k: v - eq_expected.get(k, 0.0) for k, v in delta.items()}
        out[cur["stage"]] = {
            "low_end_db": round(_mean_over(unexpected, layout, *LOW_REGION_HZ), 3),
            "hf_db": round(_mean_over(unexpected, layout, *HF_REGION_HZ), 3),
            "unexpected_band_change_db": {k: round(v, 3) for k, v in unexpected.items()},
        }
    return out


def _match_expected(expected: dict, layout: list[dict]) -> dict:
    """The planned EQ change expressed on the same level-matched basis."""
    ref = [expected.get(b["name"], 0.0) for b in layout if C.RELATIVE_REF_LOW_HZ <= b["center_hz"] <= C.RELATIVE_REF_HIGH_HZ]
    offset = float(np.mean(ref)) if ref else 0.0
    return {k: float(v) - offset for k, v in expected.items()}


def _blame(contrib: dict, key: str, sign: float) -> str | None:
    best, best_val = None, 0.0
    for stage, c in contrib.items():
        v = c[key] * sign
        if v > best_val:
            best, best_val = stage, v
    return best


def evaluate_master(
    source: SourceProfile,
    master: SourceProfile,
    master_analysis: dict,
    source_analysis: dict,
    master_audio: np.ndarray,
    sr: int,
    plan: MasteringPlan,
    context: TargetContext,
    render: dict,
) -> MasterEvaluation:
    layout = plan.band_layout
    gain = master.integrated_lufs - source.integrated_lufs
    actual = _tonal_delta(source.band_levels_db, master.band_levels_db, layout)
    expected = _match_expected(plan.expected.get("eq_band_change_db", {}), layout)
    collateral = {k: actual[k] - expected.get(k, 0.0) for k in actual}
    # Bands with no real content (level near floor) or above an encoder
    # cutoff produce meaningless ratios — excluded from judgement.
    unreliable = {b["name"] for b in layout if source.band_levels_db.get(b["name"], -120) < -95.0 or b["center_hz"] < 25.0 or (source.codec_cutoff_hz and b["lo_hz"] >= source.codec_cutoff_hz)}

    regions = {}
    for name, (lo, hi) in {"sub_30_55": (30.0, 55.0), "low_end_40_120": LOW_REGION_HZ, "low_mid_120_500": (120.0, 500.0), "mid_500_4k": (500.0, 4000.0), "hf_4k_14k": HF_REGION_HZ, "air_14k_up": (14000.0, 30000.0)}.items():
        regions[name] = {
            "actual_db": round(_mean_over(actual, layout, lo, hi, unreliable), 3),
            "planned_db": round(_mean_over(expected, layout, lo, hi, unreliable), 3),
            "collateral_db": round(_mean_over(collateral, layout, lo, hi, unreliable), 3),
        }

    contrib = _stage_contributions(render.get("stage_measurements", []), plan)
    flags: list[dict] = []

    def flag(kind: str, measured: float, limit: float, severity: float, blamed: str | None, detail: str) -> None:
        flags.append({"kind": kind, "measured": round(float(measured), 3), "limit": round(float(limit), 3), "severity": round(float(np.clip(severity, 0.0, 1.0)), 3), "blamed_stage": blamed, "detail": detail})

    low_c = regions["low_end_40_120"]["collateral_db"]
    if low_c < -C.LOW_END_COLLATERAL_TOLERANCE_DB:
        flag("low_end_loss", low_c, -C.LOW_END_COLLATERAL_TOLERANCE_DB, (abs(low_c) - C.LOW_END_COLLATERAL_TOLERANCE_DB) / 3.0 + 0.3, _blame(contrib, "low_end_db", -1.0), f"40-120 Hz lost {abs(low_c):.2f} dB more than planned ({regions['low_end_40_120']['planned_db']:+.2f} dB)")
    hf_c = regions["hf_4k_14k"]["collateral_db"]
    if hf_c > C.HF_COLLATERAL_TOLERANCE_DB:
        flag("hf_growth", hf_c, C.HF_COLLATERAL_TOLERANCE_DB, (hf_c - C.HF_COLLATERAL_TOLERANCE_DB) / 3.0 + 0.3, _blame(contrib, "hf_db", 1.0), f"4-14 kHz rose {hf_c:.2f} dB more than planned ({regions['hf_4k_14k']['planned_db']:+.2f} dB)")
    worst = max(((k, v) for k, v in collateral.items() if k not in unreliable), key=lambda kv: abs(kv[1]), default=(None, 0.0))
    if worst[0] and abs(worst[1]) > C.ANY_BAND_COLLATERAL_TOLERANCE_DB:
        stage = None
        best = 0.0
        for s, c in contrib.items():
            v = c["unexpected_band_change_db"].get(worst[0], 0.0) * np.sign(worst[1])
            if v > best:
                stage, best = s, v
        flag("band_collateral", worst[1], C.ANY_BAND_COLLATERAL_TOLERANCE_DB, (abs(worst[1]) - C.ANY_BAND_COLLATERAL_TOLERANCE_DB) / 3.0 + 0.3, stage, f"{worst[0]} moved {worst[1]:+.2f} dB beyond plan")

    # --- dynamics ------------------------------------------------------------
    lim = render.get("limiter_report", {})
    gr_p995 = float(lim.get("gr_at_p995_peaks_db", 0.0))
    budget = float(plan.limiter["budget_db"]) + (float(plan.clipper.get("share_db", 0.0)) if plan.clipper.get("enabled") else 0.0)
    if gr_p995 > budget + C.LIMITER_BUDGET_OVERSHOOT_TOLERANCE_DB:
        flag("limiter_over_budget", gr_p995, budget, (gr_p995 - budget) / 3.0 + 0.3, "bus", f"limiter took {gr_p995:.2f} dB off the loud hits (budget {budget:.2f} dB)")

    # Short-term (400 ms block) crest, not whole-file crest: the latter is
    # set by one sample peak and mostly restates the limiter's GR on it.
    crest_loss = source.crest_db - master.crest_db
    st_crest_loss = source.short_term_crest_db - master.short_term_crest_db
    allowed_crest = float(plan.expected.get("max_crest_loss_db", 6.0)) + 1.5
    if st_crest_loss > allowed_crest:
        flag("crest_collapse", st_crest_loss, allowed_crest, (st_crest_loss - allowed_crest) / 4.0 + 0.3, "bus", f"short-term crest fell {st_crest_loss:.2f} dB (allowed {allowed_crest:.2f})")
    if source.lra_lu > 3.0 and master.lra_lu < source.lra_lu * (1.0 - C.LRA_COLLAPSE_FRACTION):
        flag("lra_collapse", master.lra_lu, source.lra_lu * (1.0 - C.LRA_COLLAPSE_FRACTION), 0.4, "multiband_compression" if plan.compression.get("enabled") else "bus", f"LRA {source.lra_lu:.1f} -> {master.lra_lu:.1f} LU")

    # Transient retention at matched loudness (a louder master trips the
    # onset detector more easily, so raw scores would conflate "louder"
    # with "punchier").
    matched = master_audio * (10.0 ** (float(np.clip(-gain, -24.0, 24.0)) / 20.0))
    m_trans = _transient_metrics(matched, sr)
    src_score = float(source.drum_punch_estimate)
    mst_score = float(m_trans.get("drum_punch_estimate", 0.0))
    priority = float(context.preservation_priorities.get("transients", 0.75))
    allowed_loss = float(np.clip(0.22 - priority * 0.15, 0.04, 0.22))
    delta = mst_score - src_score
    passed_trans = bool(delta >= -allowed_loss or src_score < 0.15)
    if not passed_trans:
        flag("transient_loss", delta, -allowed_loss, (abs(delta) - allowed_loss) * 4.0 + 0.3, "bus" if not plan.compression.get("enabled") else "multiband_compression", f"drum punch {src_score:.3f} -> {mst_score:.3f} at matched loudness")

    # --- stereo / safety -----------------------------------------------------
    if master.stereo_correlation < C.SAFE_MIN_CORRELATION and master.stereo_correlation < source.stereo_correlation - 0.1:
        flag("unsafe_correlation", master.stereo_correlation, C.SAFE_MIN_CORRELATION, 0.6, "stereo", "stereo processing reduced correlation into an unsafe range")
    clipping = bool(np.any(np.abs(master_audio) >= 0.9999))
    if clipping:
        flag("clipping", 1.0, 0.0, 1.0, "bus", "full-scale samples in the master")
    tp_over = master.true_peak_db > C.LIMITER_CEILING_DBTP + 0.15
    if tp_over:
        flag("true_peak_over_ceiling", master.true_peak_db, C.LIMITER_CEILING_DBTP, 1.0, "bus", f"true peak {master.true_peak_db:.2f} dBTP")

    # --- did the planned corrections help? -----------------------------------
    before_dev = tonal_deviation(source, context)
    after_dev = tonal_deviation(master, context)
    outcomes = {}
    for kind, p in plan.detected_problems.items():
        if p.get("category") != "tonal" or not p.get("bands"):
            continue
        b_out = float(np.mean([abs(before_dev[n]["outside_db"]) for n in p["bands"] if n in before_dev]))
        a_out = float(np.mean([abs(after_dev[n]["outside_db"]) for n in p["bands"] if n in after_dev]))
        outcomes[kind] = {"outside_window_before_db": round(b_out, 3), "outside_window_after_db": round(a_out, 3), "improved": bool(a_out < b_out - 0.1), "unchanged": bool(abs(a_out - b_out) <= 0.1)}
    # A band that was IN the window but was pushed out by processing.
    created = [n for n in after_dev if abs(before_dev[n]["outside_db"]) < 1e-6 and abs(after_dev[n]["outside_db"]) > 1.0 and n not in unreliable]
    if created:
        outcomes["_new_problems_created"] = {"bands": created}

    loud = plan.loudness
    lufs = master.integrated_lufs
    score = float(sum(f["severity"] for f in flags if f["kind"] not in ("true_peak_over_ceiling", "clipping")))
    return MasterEvaluation(
        band_change_db={k: round(v, 3) for k, v in actual.items()},
        expected_band_change_db={k: round(float(v), 3) for k, v in expected.items()},
        collateral_db={k: round(v, 3) for k, v in collateral.items()},
        regions=regions,
        dynamics={
            "crest_before_db": source.crest_db,
            "crest_after_db": master.crest_db,
            "crest_change_db": round(-crest_loss, 3),
            "short_term_crest_change_db": round(-st_crest_loss, 3),
            "short_term_crest_before_db": source.short_term_crest_db,
            "short_term_crest_after_db": master.short_term_crest_db,
            "lra_before_lu": source.lra_lu,
            "lra_after_lu": master.lra_lu,
            "plr_before_db": source.plr_db,
            "plr_after_db": master.plr_db,
        },
        transients={"source_transient_score": round(src_score, 4), "master_transient_score": round(mst_score, 4), "delta": round(delta, 4), "allowed_loss": round(allowed_loss, 4), "passed": passed_trans},
        loudness={
            "integrated_lufs": lufs,
            "target_lufs": loud["target_lufs"],
            "acceptable_min_lufs": loud["acceptable_min_lufs"],
            "acceptable_max_lufs": loud["acceptable_max_lufs"],
            "in_acceptable_range": bool(loud["acceptable_min_lufs"] - 0.2 <= lufs <= loud["acceptable_max_lufs"] + 0.2),
        },
        true_peak_db=master.true_peak_db,
        clipping=clipping,
        stereo={
            "width_before": source.stereo_width,
            "width_after": master.stereo_width,
            "correlation_before": source.stereo_correlation,
            "correlation_after": master.stereo_correlation,
            "low_end_width_before": source.low_end_stereo_width,
            "low_end_width_after": master.low_end_stereo_width,
        },
        limiter={"gr_at_p995_peaks_db": gr_p995, "budget_db": budget, "max_gr_db": float(lim.get("limiter_gain_reduction_db", 0.0))},
        problem_outcomes=outcomes,
        stage_contributions=contrib,
        flags=flags,
        collateral_score=round(score, 3),
        passed=not any(f["severity"] >= C.BACKOFF_MIN_SEVERITY for f in flags),
    )
