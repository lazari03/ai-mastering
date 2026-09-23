from __future__ import annotations

import numpy as np
from pedalboard import Compressor, Pedalboard
from scipy.ndimage import minimum_filter1d
from scipy.signal import lfilter, resample_poly

from .analysis.loudness import FastMeter
from .audio_utils import EPS, _db, _oversample4, _true_peak_db


def _soft_clip(stereo: np.ndarray, ceiling_db: float = -0.3, oversample: int = 4, drive_db: float = 0.0) -> np.ndarray:
    """Gentle oversampled tanh soft-clipper, run just before the limiter.
    Catching the very tips of the loudest transients here means the
    limiter downstream has less gain reduction left to do — less limiter
    gain reduction is less audible pumping, which is the whole reason a
    clipper goes before the limiter instead of the limiter doing all the
    work alone. drive_db (default 0 = no-op multiplier) drives the signal
    harder into the tanh curve before the ceiling normalizes it back down —
    preset_dsp_engine.py's clipper spec exposes this as a per-preset knob;
    the adaptive engine's own callers don't use it."""
    ceiling = float(10.0 ** (ceiling_db / 20.0))
    drive = float(10.0 ** (drive_db / 20.0))
    up = resample_poly(stereo, oversample, 1, axis=0)
    up = np.tanh(up * drive / ceiling) * ceiling
    down = resample_poly(up, 1, oversample, axis=0)[: stereo.shape[0]]
    return down.astype(np.float32)


def _crest_factor_db(stereo: np.ndarray) -> float:
    """Whole-signal peak-vs-RMS crest factor. Orientation-independent (a
    global max/mean over every sample), so callers don't need to worry
    about (samples, channels) vs (channels, samples) layout here."""
    peak = float(np.max(np.abs(stereo)) + EPS)
    rms = float(np.sqrt(np.mean(np.square(stereo), dtype=np.float64) + EPS))
    return _db(peak) - _db(rms)


def _recover_undershot_loudness(
    render_candidate,
    measure_lufs,
    limited: np.ndarray,
    measured_lufs: float,
    target_lufs: float,
    crest_floor_db: float,
    max_iterations: int = 6,
    step_db: float = 1.5,
    min_gain_per_iteration_lufs: float = 0.05,
    tolerance_lufs: float = 0.2,
) -> tuple[np.ndarray, float, float, int]:
    """The gain-only-down true-peak limiter (and, on the standard tier,
    pedalboard.Limiter) only ever correct for OVERSHOOT past the target —
    nothing upstream compensates for loudness the limiter itself throws
    away taming a transient-heavy source, so a track landing under target
    just stays there even with several dB of unused peak headroom. This is
    the fix: push more input gain through the same clip+limit chain and
    re-measure, bounded by two independent stops rather than a blind "add
    N dB" — this genre/style's own target_dynamic_range_db as a crest-
    factor floor (don't over-limit past what this master is supposed to
    sound like), and diminishing returns (once an extra dB of input gain
    buys less than min_gain_per_iteration_lufs of real loudness, the
    limiter is absorbing it rather than the track getting louder, so
    pushing further only costs transients for no audible gain). Whichever
    stop hits first wins; either way this can only make the result louder
    than the first pass, never quieter.

    render_candidate(gain_db) -> a full clip+limit render at that extra
    input gain, in whatever layout the caller's chain uses.
    measure_lufs(candidate) -> integrated LUFS of that candidate, with
    whatever transpose pyloudnorm needs for that layout already applied.
    """
    recovery_gain_db = 0.0
    iterations = 0
    while measured_lufs < (target_lufs - tolerance_lufs) and iterations < max_iterations:
        deficit_db = target_lufs - measured_lufs
        trial_gain_db = recovery_gain_db + min(deficit_db, step_db)
        trial_limited = render_candidate(trial_gain_db)
        trial_lufs = measure_lufs(trial_limited)
        trial_crest = _crest_factor_db(trial_limited)

        if trial_crest < crest_floor_db:
            break
        if (trial_lufs - measured_lufs) < min_gain_per_iteration_lufs:
            break

        recovery_gain_db = trial_gain_db
        limited = trial_limited
        measured_lufs = trial_lufs
        iterations += 1

    return limited, measured_lufs, recovery_gain_db, iterations


def _true_peak_limiter(
    stereo: np.ndarray, sr: int, ceiling_db: float = -1.0, lookahead_ms: float = 3.0, release_ms: float = 60.0, oversample: int = 4
) -> np.ndarray:
    """Gain-only lookahead true-peak limiter. Unlike pedalboard.Limiter,
    this can only ever turn gain down. Peaks are DETECTED on a 4x
    oversampled signal (inter-sample peaks are caught), but the gain curve
    is computed and applied at the base rate: each base-rate gain is the
    minimum required over its 4 oversampled sub-samples, which is at least
    as conservative as applying it at 4x and avoids resampling the audio
    back down (and 4x-rate filtering) on every call. Used by both tiers
    (see _bus_process for why pedalboard.Limiter was retired).
    `oversample` is kept for signature compatibility (fixed at 4)."""
    ceiling = float(10.0 ** (ceiling_db / 20.0))
    stereo = np.asarray(stereo, dtype=np.float32)
    up = _oversample4(stereo)
    abs_up = np.max(np.abs(up), axis=1)
    if float(abs_up.max()) <= ceiling:
        # Nothing to limit: return the input untouched.
        return stereo
    required_up = np.minimum(1.0, ceiling / (abs_up + EPS))
    n = stereo.shape[0]
    required = required_up[: n * 4].reshape(n, 4).min(axis=1)

    # Linked stereo: one gain curve for both channels. Anticipate the peak:
    # gain at sample i is the minimum required over the NEXT lookahead
    # window, so reduction starts before the peak arrives.
    lookahead = max(1, int(sr * lookahead_ms / 1000.0))
    gain_lookahead = minimum_filter1d(required, size=lookahead, origin=-(lookahead // 2))
    # Smooth the recovery (release) side only; the elementwise minimum can
    # only be more conservative, never violate the ceiling.
    release_alpha = float(np.exp(-1.0 / (sr * release_ms / 1000.0)))
    released = lfilter([1 - release_alpha], [1, -release_alpha], gain_lookahead)
    final_gain = np.minimum(gain_lookahead, released).astype(np.float32)
    limited = stereo * final_gain[:, np.newaxis]

    # Final scalar safety trim for any residual inter-sample overshoot.
    true_peak_db = _true_peak_db(limited)
    if true_peak_db > ceiling_db:
        limited = limited * (10.0 ** ((ceiling_db - true_peak_db) / 20.0))
    return limited.astype(np.float32)


def _bus_process_pro(stereo: np.ndarray, sr: int, params: dict, apply_glue_compression: bool = True) -> tuple[np.ndarray, float, dict, dict]:
    """Professional-tier bus stage: glue-compression/gain-staging, clipper,
    true-peak limiting and loudness recovery (the standard tier's
    _bus_process now uses the same gain-only limiter)."""
    stereo_pb = np.ascontiguousarray(stereo.T, dtype=np.float32)

    if apply_glue_compression and bool(params.get("glue_enabled", True)):
        bus_board = Pedalboard(
            [
                Compressor(
                    threshold_db=float(params.get("glue_threshold_db", -20.5)),
                    ratio=float(params.get("glue_ratio", 1.2)),
                    attack_ms=55.0,
                    release_ms=320.0,
                ),
            ]
        )
        stereo_pb = bus_board(stereo_pb, sr)

    meter = FastMeter(sr)
    lufs_pre = float(meter.integrated_loudness(stereo_pb.T))
    gain_db = float(params["target_lufs"] - lufs_pre)
    gain_lin = float(10.0 ** (gain_db / 20.0))
    stereo_pb = stereo_pb * gain_lin

    pre_limiter = np.asarray(stereo_pb.T, dtype=np.float32)
    pre_clip_peak_db = _true_peak_db(pre_limiter)
    # Clipper is source-adaptive (see mastering_params.py's clipper_enabled —
    # "clipper must not automatically shave drums" just because this tier/
    # preset has one) — skipped entirely, not just reduced, on a source
    # with strong transients and little budget left to spend on shaving
    # peaks before the limiter does.
    clipper_enabled = bool(params.get("clipper_enabled", True))
    clipped = _soft_clip(pre_limiter, ceiling_db=-0.3) if clipper_enabled else pre_limiter
    clipper_gain_reduction_db = float(max(0.0, pre_clip_peak_db - _true_peak_db(clipped))) if clipper_enabled else 0.0

    limiter_release_ms = float(params.get("limiter_release_ms", 60.0))
    limited = _true_peak_limiter(clipped, sr, ceiling_db=-1.0, release_ms=limiter_release_ms)

    pre_peak_db = pre_clip_peak_db
    post_peak_db = _true_peak_db(limited)
    limiter_gain_reduction_db = float(max(0.0, pre_peak_db - post_peak_db))

    measured_lufs = float(meter.integrated_loudness(limited))
    limited, measured_lufs, recovery_gain_db, recovery_iterations = _recover_undershot_loudness(
        render_candidate=lambda gain_db: _true_peak_limiter(
            _soft_clip(pre_limiter * (10.0 ** (gain_db / 20.0)), ceiling_db=-0.3) if clipper_enabled else pre_limiter * (10.0 ** (gain_db / 20.0)),
            sr,
            ceiling_db=-1.0,
            release_ms=limiter_release_ms,
        ),
        measure_lufs=lambda x: float(meter.integrated_loudness(x)),
        limited=limited,
        measured_lufs=measured_lufs,
        target_lufs=float(params["target_lufs"]),
        # Quality-over-LUFS crest floor (spec: "LUFS is a target RANGE, not
        # an absolute requirement") — limiter_crest_floor_db already widens
        # this beyond the plain target_dynamic_range_db when the source's
        # transient budget is tight (see mastering_params.py), so loudness
        # recovery stops sooner and leaves more headroom intact on exactly
        # the material that has the most punch to lose.
        crest_floor_db=float(params.get("limiter_crest_floor_db", params.get("target_dynamic_range_db", 8.0))),
    )
    if recovery_iterations:
        post_peak_db = _true_peak_db(limited)
        limiter_gain_reduction_db = float(max(0.0, pre_peak_db - post_peak_db))

    loudness_guard = {"applied": False, "attenuation_db": 0.0, "measured_after_guard_lufs": None, "iterations": 0}
    tolerance_lufs = 0.2
    target_ceiling = float(params["target_lufs"]) + tolerance_lufs

    overshoot = measured_lufs - target_ceiling
    if overshoot > 0:
        attenuation_db = float(overshoot)
        limited = limited * (10.0 ** (-attenuation_db / 20.0))
        measured_lufs = float(meter.integrated_loudness(limited))
        loudness_guard.update(
            {
                "applied": True,
                "attenuation_db": round(attenuation_db, 3),
                "measured_after_guard_lufs": round(measured_lufs, 3),
                "iterations": 1,
            }
        )

    limiter_report = {
        "limiter_gain_reduction_db": round(limiter_gain_reduction_db, 3),
        "pre_limiter_peak_db": round(pre_peak_db, 3),
        "post_limiter_peak_db": round(post_peak_db, 3),
        "clipper_applied": clipper_enabled,
        "clipper_gain_reduction_db": round(clipper_gain_reduction_db, 3),
        "release_ms": round(limiter_release_ms, 1),
        "true_peak_aware": True,
        "loudness_recovery_db": round(recovery_gain_db, 3),
        "loudness_recovery_iterations": recovery_iterations,
    }

    return np.asarray(limited, dtype=np.float32), gain_db, loudness_guard, limiter_report


def _bus_process(stereo: np.ndarray, sr: int, params: dict, apply_glue_compression: bool = True) -> tuple[np.ndarray, float, dict, dict]:
    stereo_pb = np.ascontiguousarray(stereo.T, dtype=np.float32)

    if apply_glue_compression and bool(params.get("glue_enabled", True)):
        bus_board = Pedalboard(
            [
                Compressor(
                    threshold_db=float(params.get("glue_threshold_db", -20.5)),
                    ratio=float(params.get("glue_ratio", 1.2)),
                    attack_ms=55.0,
                    release_ms=320.0,
                ),
            ]
        )
        stereo_pb = bus_board(stereo_pb, sr)

    meter = FastMeter(sr)
    lufs_pre = float(meter.integrated_loudness(stereo_pb.T))
    gain_db = float(params["target_lufs"] - lufs_pre)
    gain_lin = float(10.0 ** (gain_db / 20.0))
    stereo_pb = stereo_pb * gain_lin

    pre_limiter = np.asarray(stereo_pb, dtype=np.float32)

    clipper_enabled = bool(params.get("clipper_enabled", True))
    pre_clip_peak = float(np.max(np.abs(pre_limiter)) + EPS)
    clipped = _soft_clip(pre_limiter.T, ceiling_db=-0.3).T if clipper_enabled else pre_limiter
    clipper_gain_reduction_db = float(max(0.0, _db(pre_clip_peak) - _db(float(np.max(np.abs(clipped)) + EPS)))) if clipper_enabled else 0.0

    # Gain-only true-peak limiter on BOTH tiers. pedalboard.Limiter (JUCE)
    # is not a transparent peak limiter: it contains a fixed first-stage
    # 4:1 compressor at -10 dBFS (2 ms attack) plus make-up gain. On a
    # -14 LUFS master that stage alone measured -4 dB at 55-120 Hz and a
    # ~38% loss of drum punch while "limiter gain reduction" read ~0 dB —
    # a hidden source of lost low end and softened transients.
    limiter_release_ms = float(params.get("limiter_release_ms", 120.0))

    def limiter(buf: np.ndarray, _sr: int) -> np.ndarray:
        return _true_peak_limiter(np.asarray(buf, dtype=np.float32).T, _sr, ceiling_db=-1.0, release_ms=limiter_release_ms).T

    stereo_pb = limiter(np.ascontiguousarray(clipped, dtype=np.float32), sr)

    pre_peak = pre_clip_peak
    post_peak = float(np.max(np.abs(stereo_pb)) + EPS)
    limiter_gain_reduction_db = float(max(0.0, _db(pre_peak) - _db(post_peak)))

    # Final true-peak guard in case inter-sample/implementation behavior exceeds
    # target. True peak (oversampled), not sample peak — a sample-peak check
    # can miss inter-sample overs that genuinely exceed 0dBFS on real content:
    # validate_mastering.py found hiphop/edm renders hitting +1.0dBTP
    # undetected by the old np.max(np.abs(...)) check. This is a correctness
    # fix (a spec violation), not a Professional-tier feature — the actual
    # lookahead true-peak *limiter* and sub/punch band split stay Pro-only.
    target_peak_db = -1.0
    observed_true_peak_db = _true_peak_db(stereo_pb.T)
    if observed_true_peak_db > target_peak_db:
        stereo_pb = stereo_pb * (10.0 ** ((target_peak_db - observed_true_peak_db) / 20.0))

    def _render_recovery_candidate(extra_gain_db: float) -> np.ndarray:
        boosted = pre_limiter * (10.0 ** (extra_gain_db / 20.0))
        clipped_c = _soft_clip(boosted.T, ceiling_db=-0.3).T if clipper_enabled else boosted
        limited_c = limiter(np.ascontiguousarray(clipped_c, dtype=np.float32), sr)
        tp_db = _true_peak_db(limited_c.T)
        if tp_db > target_peak_db:
            limited_c = limited_c * (10.0 ** ((target_peak_db - tp_db) / 20.0))
        return limited_c

    measured_lufs = float(meter.integrated_loudness(stereo_pb.T))
    stereo_pb, measured_lufs, recovery_gain_db, recovery_iterations = _recover_undershot_loudness(
        render_candidate=_render_recovery_candidate,
        measure_lufs=lambda x: float(meter.integrated_loudness(x.T)),
        limited=stereo_pb,
        measured_lufs=measured_lufs,
        target_lufs=float(params["target_lufs"]),
        crest_floor_db=float(params.get("limiter_crest_floor_db", params.get("target_dynamic_range_db", 8.0))),
    )
    if recovery_iterations:
        post_peak = float(np.max(np.abs(stereo_pb)) + EPS)
        limiter_gain_reduction_db = float(max(0.0, _db(pre_peak) - _db(post_peak)))

    # Final loudness guard: attenuate once to enforce LUFS ceiling, then confirm.
    loudness_guard = {"applied": False, "attenuation_db": 0.0, "measured_after_guard_lufs": None, "iterations": 0}
    tolerance_lufs = 0.2
    target_ceiling = float(params["target_lufs"]) + tolerance_lufs

    overshoot = measured_lufs - target_ceiling
    if overshoot > 0:
        attenuation_db = float(overshoot)
        stereo_pb = stereo_pb * (10.0 ** (-attenuation_db / 20.0))
        measured_lufs = float(meter.integrated_loudness(stereo_pb.T))
        loudness_guard.update(
            {
                "applied": True,
                "attenuation_db": round(attenuation_db, 3),
                "measured_after_guard_lufs": round(measured_lufs, 3),
                "iterations": 1,
            }
        )

    observed_true_peak_db = _true_peak_db(stereo_pb.T)
    if observed_true_peak_db > target_peak_db:
        stereo_pb = stereo_pb * (10.0 ** ((target_peak_db - observed_true_peak_db) / 20.0))

    limiter_report = {
        "limiter_gain_reduction_db": round(limiter_gain_reduction_db, 3),
        "pre_limiter_peak_db": round(_db(pre_peak), 3),
        "post_limiter_peak_db": round(_db(post_peak), 3),
        "clipper_applied": clipper_enabled,
        "clipper_gain_reduction_db": round(clipper_gain_reduction_db, 3),
        "release_ms": round(limiter_release_ms, 1),
        "loudness_recovery_db": round(recovery_gain_db, 3),
        "loudness_recovery_iterations": recovery_iterations,
    }

    return np.asarray(stereo_pb.T, dtype=np.float32), gain_db, loudness_guard, limiter_report
