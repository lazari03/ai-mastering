from __future__ import annotations

import numpy as np
import pyloudnorm as pyln
from pedalboard import Compressor, Limiter, Pedalboard
from scipy.ndimage import minimum_filter1d
from scipy.signal import lfilter, resample_poly

from .audio_utils import EPS, _db, _true_peak_db


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
    """Gain-only lookahead true-peak limiter. Unlike pedalboard.Limiter (which
    applies makeup gain toward its threshold — see preset_dsp_engine.py for
    where that bit us), this can only ever turn gain
    down, and it works on an oversampled signal so inter-sample peaks are
    actually caught, not just the peak of the sampled points. Professional
    tier only — the free tier's pedalboard.Limiter-based path is untouched."""
    ceiling = float(10.0 ** (ceiling_db / 20.0))
    up = resample_poly(stereo, oversample, 1, axis=0)
    up_sr = sr * oversample

    # Linked stereo detection: one gain curve for both channels, from
    # whichever channel is louder at each instant.
    abs_up = np.max(np.abs(up), axis=1)
    required_gain = np.minimum(1.0, ceiling / (abs_up + EPS))

    lookahead_samples = max(1, int(up_sr * lookahead_ms / 1000.0))
    # Anticipate the peak: gain at sample i is the minimum required over the
    # NEXT lookahead_samples, so reduction starts slightly before the peak
    # arrives instead of reacting after the fact.
    gain_lookahead = minimum_filter1d(required_gain, size=lookahead_samples, origin=-(lookahead_samples // 2))

    # Smooth the recovery (release) side only. Taking the elementwise minimum
    # of the raw lookahead gain and its release-smoothed version can only make
    # the result more conservative, never less — the true-peak ceiling can't
    # be violated by this smoothing step.
    release_alpha = float(np.exp(-1.0 / (up_sr * release_ms / 1000.0)))
    released = lfilter([1 - release_alpha], [1, -release_alpha], gain_lookahead)
    final_gain = np.minimum(gain_lookahead, released)

    limited_up = up * final_gain[:, np.newaxis]
    down = resample_poly(limited_up, 1, oversample, axis=0)[: stereo.shape[0]]

    # Downsampling can reintroduce a hair of overshoot from filter ringing —
    # one last scalar safety trim, same pattern used everywhere else in this
    # codebase for exactly that reason.
    true_peak_db = _true_peak_db(down)
    if true_peak_db > ceiling_db:
        down = down * (10.0 ** ((ceiling_db - true_peak_db) / 20.0))
    return down.astype(np.float32)


def _bus_process_pro(stereo: np.ndarray, sr: int, params: dict, apply_glue_compression: bool = True) -> tuple[np.ndarray, float, dict, dict]:
    """Professional-tier bus stage: same glue-compression/gain-staging as
    _bus_process, but true-peak limiting via _true_peak_limiter instead of
    pedalboard.Limiter."""
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

    meter = pyln.Meter(sr)
    lufs_pre = float(meter.integrated_loudness(stereo_pb.T))
    gain_db = float(params["target_lufs"] - lufs_pre)
    gain_lin = float(10.0 ** (gain_db / 20.0))
    stereo_pb = stereo_pb * gain_lin

    pre_limiter = np.asarray(stereo_pb.T, dtype=np.float32)
    pre_clip_peak_db = _true_peak_db(pre_limiter)
    clipped = _soft_clip(pre_limiter, ceiling_db=-0.3)
    clipper_gain_reduction_db = float(max(0.0, pre_clip_peak_db - _true_peak_db(clipped)))

    limiter_release_ms = float(params.get("limiter_release_ms", 60.0))
    limited = _true_peak_limiter(clipped, sr, ceiling_db=-1.0, release_ms=limiter_release_ms)

    pre_peak_db = pre_clip_peak_db
    post_peak_db = _true_peak_db(limited)
    limiter_gain_reduction_db = float(max(0.0, pre_peak_db - post_peak_db))

    measured_lufs = float(meter.integrated_loudness(limited))
    limited, measured_lufs, recovery_gain_db, recovery_iterations = _recover_undershot_loudness(
        render_candidate=lambda gain_db: _true_peak_limiter(
            _soft_clip(pre_limiter * (10.0 ** (gain_db / 20.0)), ceiling_db=-0.3),
            sr,
            ceiling_db=-1.0,
            release_ms=limiter_release_ms,
        ),
        measure_lufs=lambda x: float(meter.integrated_loudness(x)),
        limited=limited,
        measured_lufs=measured_lufs,
        target_lufs=float(params["target_lufs"]),
        crest_floor_db=float(params.get("target_dynamic_range_db", 8.0)),
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

    meter = pyln.Meter(sr)
    lufs_pre = float(meter.integrated_loudness(stereo_pb.T))
    gain_db = float(params["target_lufs"] - lufs_pre)
    gain_lin = float(10.0 ** (gain_db / 20.0))
    stereo_pb = stereo_pb * gain_lin

    pre_limiter = np.asarray(stereo_pb, dtype=np.float32)

    pre_clip_peak = float(np.max(np.abs(pre_limiter)) + EPS)
    clipped = _soft_clip(pre_limiter.T, ceiling_db=-0.3).T
    clipper_gain_reduction_db = float(max(0.0, _db(pre_clip_peak) - _db(float(np.max(np.abs(clipped)) + EPS))))

    limiter_release_ms = float(params.get("limiter_release_ms", 120.0))
    limiter = Pedalboard([Limiter(threshold_db=-1.0, release_ms=limiter_release_ms)])
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
        clipped_c = _soft_clip(boosted.T, ceiling_db=-0.3).T
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
        crest_floor_db=float(params.get("target_dynamic_range_db", 8.0)),
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
        "clipper_gain_reduction_db": round(clipper_gain_reduction_db, 3),
        "release_ms": round(limiter_release_ms, 1),
        "loudness_recovery_db": round(recovery_gain_db, 3),
        "loudness_recovery_iterations": recovery_iterations,
    }

    return np.asarray(stereo_pb.T, dtype=np.float32), gain_db, loudness_guard, limiter_report
