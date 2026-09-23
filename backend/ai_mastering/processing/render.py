"""Plan-driven render.

Stages run in a fixed order and ONLY when the plan enables them; a stage
that is disabled does not touch the signal at all (no "ratio 1.05" or
split-and-resum colouration standing in for "off"):

    static EQ -> dynamic EQ -> compression (multiband, glue) -> de-esser
    -> saturation -> stereo -> bus (gain, clipper, limiter, loudness guard)

After each stage that ran, the signal's hi-res band levels and LUFS are
measured (cheap: one STFT + one loudness measurement), so the evaluator can
attribute any unexpected spectral change to the stage that caused it
instead of guessing. Only measurements are kept, never intermediate audio.
"""

from __future__ import annotations

import numpy as np
from pedalboard import Compressor, Pedalboard
from scipy.signal import resample_poly

from ..analysis.dynamics import peak_percentile_db
from ..analysis.loudness import FastMeter
from ..analysis.spectral import analyze_spectrum
from ..bus_processing import _bus_process, _bus_process_pro
from ..dsp_filters import _bandpass, _complementary_split, _deess, _envelope_db, _lr4_lowpass
from ..planning import config as C
from ..planning.plan import MasteringPlan
from .eq import apply_eq, apply_eq_mono

EPS = 1e-12

_BAND_SPLITS = {
    "standard": ((250.0, 2000.0, 6000.0), ("low", "low_mid", "high_mid", "high")),
    "professional": ((90.0, 250.0, 2000.0, 6000.0), ("sub", "punch", "low_mid", "high_mid", "high")),
}


def _lufs(meter: FastMeter, x: np.ndarray) -> float:
    try:
        v = float(meter.integrated_loudness(x))
    except Exception:
        v = -70.0
    return v if np.isfinite(v) else -70.0


def _measure(stage: str, x: np.ndarray, sr: int, meter: FastMeter) -> dict:
    spec = analyze_spectrum(x, sr)
    return {"stage": stage, "lufs": round(_lufs(meter, x), 3), "band_levels_db": spec["level_db"], "stereo_regions": spec["stereo_regions"]}


def _ms(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return (x[:, 0] + x[:, 1]) * 0.5, (x[:, 0] - x[:, 1]) * 0.5


def _lr(mid: np.ndarray, side: np.ndarray) -> np.ndarray:
    return np.stack([mid + side, mid - side], axis=1).astype(np.float32)


def _active_rms_db(x: np.ndarray, sr: int) -> float:
    """RMS over non-silent 100 ms blocks — the level a compressor threshold
    should be relative to (so identical settings behave identically on a
    -30 LUFS and a -12 LUFS upload)."""
    mono = x if x.ndim == 1 else x.mean(axis=1)
    block = max(1, int(sr * 0.1))
    n = mono.size // block
    if n < 1:
        return 20.0 * np.log10(float(np.sqrt(np.mean(mono**2))) + EPS)
    rms = np.sqrt(np.mean(mono[: n * block].reshape(n, block) ** 2, axis=1))
    db = 20.0 * np.log10(rms + EPS)
    active = rms[db > db.max() - 30.0]
    return float(20.0 * np.log10(np.sqrt(np.mean(active**2)) + EPS))


def _compress(x: np.ndarray, sr: int, ratio: float, threshold_db: float, attack_ms: float, release_ms: float, max_gr_db: float | None) -> tuple[np.ndarray, float]:
    board = Pedalboard([Compressor(threshold_db=float(threshold_db), ratio=float(max(ratio, 1.0)), attack_ms=float(attack_ms), release_ms=float(release_ms))])
    y = np.asarray(board(np.ascontiguousarray(x.T, dtype=np.float32), sr).T, dtype=np.float32)
    in_rms = float(np.sqrt(np.mean(x**2)) + EPS)
    out_rms = float(np.sqrt(np.mean(y**2)) + EPS)
    gr = 20.0 * np.log10(in_rms / out_rms)
    if max_gr_db is not None and gr > max_gr_db > 0 and abs(out_rms - in_rms) > EPS:
        # Same cap as the legacy per-band processor: blend back toward dry
        # so the band never loses more than max_gr_db of average level.
        target = 10.0 ** (-max_gr_db / 20.0) * in_rms
        mix = float(np.clip((target - in_rms) / (out_rms - in_rms), 0.0, 1.0))
        y = (mix * y + (1.0 - mix) * x).astype(np.float32)
        gr = 20.0 * np.log10(in_rms / (float(np.sqrt(np.mean(y**2))) + EPS))
    return y, float(gr)


def _saturate(x: np.ndarray, sr: int, drive_db: float, reference_db: float, oversample: int = 4) -> np.ndarray:
    """Level-referenced, gain-compensated oversampled tanh:
    y = ref * tanh(g * x / ref) / g. Unity gain for small signals; the
    source's own loud hits (99.5th-percentile peak = ref) see `drive_db` of
    drive regardless of how loud the upload is."""
    if drive_db <= 0.01:
        return x
    g = 10.0 ** (drive_db / 20.0)
    ref = 10.0 ** (reference_db / 20.0)
    up = resample_poly(x, oversample, 1)
    up = ref * np.tanh(g * up / ref) / g
    return resample_poly(up, 1, oversample)[: x.shape[0]].astype(np.float32)


def render_plan(audio: np.ndarray, sr: int, plan: MasteringPlan, measure_stages: bool = True) -> dict:
    tier = "professional" if plan.tier == "professional" else "standard"
    meter = FastMeter(sr)
    stages: list[dict] = []
    report: dict = {"stages_run": []}
    x = np.asarray(audio, dtype=np.float32)

    def done(stage: str, **info) -> None:
        report["stages_run"].append(stage)
        if info:
            report[stage] = info
        if measure_stages:
            stages.append(_measure(stage, x, sr, meter))

    if measure_stages:
        stages.append(_measure("input", x, sr, meter))

    # 1. static EQ (automatic + explicit user tweaks), identical on L/R
    if plan.eq_decisions:
        x = apply_eq(x, plan.eq_decisions, sr)
        done("eq", filters=len(plan.eq_decisions))

    # 2. dynamic EQ, M/S-linked (one gain curve from the mid channel)
    if plan.dynamic_eq_decisions:
        mid, side = _ms(x)
        applied = []
        for d in plan.dynamic_eq_decisions:
            n_mid = _bandpass(mid, sr, d.frequency_hz, d.q)
            n_side = _bandpass(side, sr, d.frequency_hz, d.q)
            env = _envelope_db(n_mid, sr, d.release_ms)
            thr = float(np.percentile(env, d.threshold_percentile))
            red = np.clip(env - thr, 0.0, d.max_reduction_db)
            gain = 10.0 ** (-red / 20.0)
            mid = (mid - n_mid + n_mid * gain).astype(np.float32)
            side = (side - n_side + n_side * gain).astype(np.float32)
            applied.append({"frequency_hz": round(d.frequency_hz, 1), "mean_reduction_db": round(float(np.mean(red)), 3), "max_reduction_db": round(float(np.max(red)), 3)})
        x = _lr(mid, side)
        done("dynamic_eq", nodes=applied)

    # 3. compression — only if the plan found a need
    comp = plan.compression
    if comp.get("multiband", {}).get("enabled"):
        crossovers, names = _BAND_SPLITS[tier]
        left = _complementary_split(x[:, 0], sr, crossovers, names)
        right = _complementary_split(x[:, 1], sr, crossovers, names)
        out = np.zeros_like(x)
        band_gr = {}
        for name in names:
            b = np.stack([left[name], right[name]], axis=1).astype(np.float32)
            cfg = comp["multiband"]["bands"].get(name)
            if cfg is None or cfg["ratio"] <= 1.0005:
                out += b
                continue
            thr = _active_rms_db(b, sr) + float(cfg["threshold_offset_db"])
            y, gr = _compress(b, sr, cfg["ratio"], thr, cfg["attack_ms"], cfg["release_ms"], cfg["max_gain_reduction_db"])
            out += y
            band_gr[name] = round(gr, 3)
        x = out.astype(np.float32)
        done("multiband_compression", average_gain_reduction_db=band_gr)
    if comp.get("glue", {}).get("enabled"):
        g = comp["glue"]
        thr = _active_rms_db(x, sr) + float(g["threshold_offset_db"])
        x, gr = _compress(x, sr, g["ratio"], thr, g["attack_ms"], g["release_ms"], None)
        done("glue_compression", average_gain_reduction_db=round(gr, 3), threshold_db=round(thr, 2))

    # 4. de-esser (mid only — full-mix sibilance is centred)
    if plan.deesser.get("enabled"):
        mid, side = _ms(x)
        mid = _deess(mid, sr, float(plan.deesser["strength"]), center_hz=float(plan.deesser["center_hz"]), q=float(plan.deesser.get("q", 2.4))).astype(np.float32)
        x = _lr(mid, side)
        done("deesser", center_hz=plan.deesser["center_hz"], strength=plan.deesser["strength"])

    # 5. saturation
    if plan.saturation.get("enabled"):
        ref_db = peak_percentile_db(x, sr)
        mid, side = _ms(x)
        drive = float(plan.saturation["drive_db"])
        mid = _saturate(mid, sr, drive, ref_db)
        side = _saturate(side, sr, drive * float(plan.saturation.get("side_drive_scale", 0.3)), ref_db)
        x = _lr(mid, side)
        done("saturation", drive_db=drive, reference_peak_db=round(ref_db, 2))

    # 6. stereo — frequency-aware
    st = plan.stereo
    if st.get("enabled"):
        pre_stereo = x
        mid, side = _ms(x)
        info = {}
        if st.get("lf_mono", {}).get("enabled"):
            cutoff = float(st["lf_mono"]["cutoff_hz"])
            side = (side - _lr4_lowpass(side, cutoff, sr)).astype(np.float32)  # complementary, zero phase
            info["lf_mono_cutoff_hz"] = cutoff
        side_gain_db = float(st.get("side_gain_db", 0.0)) + float(st.get("user_side_gain_db", 0.0))
        side_gain_db = float(np.clip(side_gain_db, C.MAX_NARROW_DB, C.MAX_WIDEN_DB))
        if abs(side_gain_db) > 1e-3:
            side = side * float(10.0 ** (side_gain_db / 20.0))
            info["side_gain_db"] = round(side_gain_db, 3)
        shelf_db = float(st.get("side_high_shelf_db", 0.0))
        if abs(shelf_db) > 1e-3:
            from ..planning.plan import EQDecision

            side = apply_eq_mono(side, [EQDecision("high_shelf", float(st.get("side_shelf_hz", 1500.0)), shelf_db, 0.707, 1.0, "stereo_widen")], sr)
            info["side_high_shelf_db"] = round(shelf_db, 3)
        x = _lr(mid, side)
        # Safety: never let width processing push correlation negative.
        corr = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]) if np.std(x[:, 1]) > 0 else 1.0
        if corr < C.SAFE_MIN_CORRELATION and side_gain_db + shelf_db > 0:
            x = pre_stereo  # fall back to the unwidened signal
            info["reverted_unsafe_correlation"] = round(corr, 3)
        done("stereo", **info)

    # 7. bus: loudness gain within the limiter damage budget, then limit
    lufs_pre = _lufs(meter, x)
    peak_pre = peak_percentile_db(x, sr)
    lim = plan.limiter
    clip_share = float(plan.clipper.get("share_db", 0.0)) if plan.clipper.get("enabled") else 0.0
    max_gain = C.LIMITER_CEILING_DBTP + float(lim["budget_db"]) + clip_share - peak_pre
    planned = float(plan.loudness["target_lufs"])
    target = min(planned, lufs_pre + max_gain)
    bus_params = {
        "target_lufs": target,
        "clipper_enabled": bool(plan.clipper.get("enabled")),
        "limiter_release_ms": float(lim["release_ms"]),
        "limiter_crest_floor_db": float(lim.get("crest_floor_db", plan.target_context.get("target_crest_db", 8.0))),
        "target_dynamic_range_db": float(plan.target_context.get("target_crest_db", 8.0)),
        "glue_enabled": False,
    }
    bus_fn = _bus_process_pro if tier == "professional" else _bus_process
    y, lufs_gain_db, loudness_guard, limiter_report = bus_fn(x, sr, bus_params, apply_glue_compression=False)
    total_gain_db = float(lufs_gain_db) + float(limiter_report.get("loudness_recovery_db", 0.0)) - float(loudness_guard.get("attenuation_db", 0.0))
    peak_post = peak_percentile_db(y, sr)
    limiter_report["gr_at_p995_peaks_db"] = round(max(0.0, peak_pre + float(lufs_gain_db) + float(limiter_report.get("loudness_recovery_db", 0.0)) - peak_post - float(loudness_guard.get("attenuation_db", 0.0))), 3)
    limiter_report["budget_db"] = float(lim["budget_db"])
    x = y
    done(
        "bus",
        prebus_lufs=round(lufs_pre, 2),
        prebus_peak_p995_db=round(peak_pre, 2),
        planned_target_lufs=round(planned, 2),
        budget_capped_target_lufs=round(target, 2),
        capped_by_limiter_budget=bool(target < planned - 0.05),
        total_gain_db=round(total_gain_db, 3),
    )
    return {
        "audio": x,
        "report": report,
        "stage_measurements": stages,
        "limiter_report": limiter_report,
        "loudness_guard": loudness_guard,
        "lufs_gain_db": float(lufs_gain_db),
        "bus_params": bus_params,
    }
