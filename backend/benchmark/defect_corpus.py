"""Ground-truth defect corpus for validating Auralith's OWN measurements.

Every case is a (source, processed) pair framed the way the quality gate
uses them: ``processed = source + one known defect`` (or ``source + a
harmless change``). Each case records the defect class, the nominal dose,
the expected label ("defect" / "control") and an INDEPENDENT measurement of
what was actually injected (plain FFT band energy, sample statistics, an
8x-oversampled peak, a known kick grid ...) so the ground truth does not
rely on the engine's own analysis code.

Deterministic: references and defects are seeded; nothing reads the clock.
Signals are short (default 12 s) so a full scorecard stays under ~10 min.

Reuse: reference programs come from tests/synthetic.make_mix (the same
calibrated generator behind benchmark/synthetic_corpus.py).
"""

from __future__ import annotations

import hashlib
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
from scipy.signal import butter, resample_poly, sosfiltfilt

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "tests"))

from synthetic import SR, make_mix  # noqa: E402

SECONDS = 12.0
BPM = 120.0
BEAT_S = 60.0 / BPM
SECTION = (4.0, 8.0)  # seconds; the "one section only" defects live here
BURST_S = 0.3  # short-burst length (< 500 ms)

# Reference programs: genre / density spread. All use the shared generator.
REFERENCES: dict[str, dict] = {
    "pop_mid": dict(seed=11, healthy_variation_db=1.0),
    "edm_dense": dict(seed=12, drum_level=1.2, healthy_variation_db=0.5, lufs=-14.0, limit_db=-5.0),
    "jazz_sparse": dict(seed=13, drum_level=0.25, section_depth_db=5.0, lufs=-24.0),
    "hiphop_bassheavy": dict(seed=14, offsets_db=[(40, 250, 6.5)], healthy_variation_db=0.5),
}
# Reference sample peak (-7 dBFS): a +/-3 dB gain control stays under the export
# ceiling, so a true-peak hit on a gain control would be a real over, not a false alarm.
REF_PEAK = 0.45
QUICK_REFERENCES = ("pop_mid", "hiphop_bassheavy")


# ---------------------------------------------------------------- primitives
def _fft_gain(x: np.ndarray, gain_db_fn: Callable[[np.ndarray], np.ndarray]) -> np.ndarray:
    n = x.shape[0]
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    g = 10.0 ** (gain_db_fn(np.maximum(f, 1.0)) / 20.0)
    return np.fft.irfft(spec * g[:, None], n=n, axis=0).astype(np.float32)


def low_shelf_db(f, edge_hz: float, db: float):
    """Smooth shelf: full `db` below edge/1.4, 0 above edge*1.4 (log-f ramp)."""
    t = np.clip((np.log2(f / edge_hz) + 0.5) / 1.0, 0.0, 1.0)
    return db * (1.0 - (3 * t**2 - 2 * t**3))


def bell_db(f, lo_hz: float, hi_hz: float, db: float):
    """Flat-top boost over [lo,hi] with 1/3-octave raised-cosine skirts."""
    lf = np.log2(f)
    a, b = np.log2(lo_hz), np.log2(hi_hz)
    s = 1.0 / 3.0
    up = np.clip((lf - (a - s)) / s, 0.0, 1.0)
    dn = np.clip(((b + s) - lf) / s, 0.0, 1.0)
    w = np.minimum(3 * up**2 - 2 * up**3, 3 * dn**2 - 2 * dn**3)
    return db * w


def _mono(x: np.ndarray) -> np.ndarray:
    return x.mean(axis=1) if x.ndim == 2 else x


def _band_rms_db(x: np.ndarray, lo: float, hi: float, sr: int = SR) -> float:
    """INDEPENDENT band level: plain FFT energy inside [lo,hi]."""
    spec = np.fft.rfft(_mono(x))
    f = np.fft.rfftfreq(len(_mono(x)), 1.0 / sr)
    m = (f >= lo) & (f < hi)
    return float(10.0 * np.log10(np.sum(np.abs(spec[m]) ** 2) + 1e-20))


def _env(x: np.ndarray, ms: float) -> np.ndarray:
    n = max(1, int(SR * ms / 1000.0))
    return np.sqrt(uniform_filter1d(_mono(x).astype(np.float64) ** 2, n, mode="nearest") + 1e-12)


def true_peak_db_indep(x: np.ndarray, os: int = 8) -> float:
    y = resample_poly(x, os, 1, axis=0)
    return float(20.0 * np.log10(np.max(np.abs(y)) + 1e-12))


def kick_times(seconds: float) -> np.ndarray:
    """Kick onsets of tests/synthetic._drums: one per beat from t=0."""
    return np.arange(0.0, seconds - 0.4, BEAT_S)


def _window_gain(n: int, t0: float, t1: float, ramp_s: float = 0.02) -> np.ndarray:
    """0..1 window over [t0,t1] with short cosine ramps (no clicks)."""
    t = np.arange(n) / SR
    up = np.clip((t - t0) / ramp_s, 0, 1)
    dn = np.clip((t1 - t) / ramp_s, 0, 1)
    return (0.5 - 0.5 * np.cos(np.pi * np.minimum(up, dn))).astype(np.float32)


# ------------------------------------------------------------------- defects
@dataclass
class Case:
    case_id: str
    reference: str
    defect_class: str            # taxonomy key (see CLASSES)
    label: str                   # "defect" | "control"
    dose: float | None           # nominal dose (units in dose_unit)
    dose_unit: str
    variant: str                 # global | section | burst | loudness_matched | ...
    source: np.ndarray = field(repr=False, default=None)
    processed: np.ndarray = field(repr=False, default=None)
    injected: dict = field(default_factory=dict)  # independent measurements
    params: dict = field(default_factory=dict)

    def meta(self) -> dict:
        return {
            "case_id": self.case_id, "reference": self.reference, "defect_class": self.defect_class,
            "label": self.label, "dose": self.dose, "dose_unit": self.dose_unit, "variant": self.variant,
            "injected": self.injected, "params": self.params,
            "source_sha1": audio_hash(self.source), "processed_sha1": audio_hash(self.processed),
        }


def audio_hash(x: np.ndarray) -> str:
    return hashlib.sha1(np.ascontiguousarray(x, dtype=np.float32).tobytes()).hexdigest()[:12]


def _lufs(x: np.ndarray) -> float:
    import pyloudnorm as pyln
    return float(pyln.Meter(SR).integrated_loudness(x))


def match_loudness(x: np.ndarray, ref: np.ndarray) -> np.ndarray:
    return (x * 10.0 ** ((_lufs(ref) - _lufs(x)) / 20.0)).astype(np.float32)


def make_reference(name: str) -> np.ndarray:
    x = make_mix(seconds=SECONDS, bpm=BPM, **REFERENCES[name])
    # headroom so a QC true-peak/clipping hit on the SOURCE can't confound
    peak = float(np.max(np.abs(x)))
    if peak > REF_PEAK:
        x = x * (REF_PEAK / peak)
    return x.astype(np.float32)


def d_low_shelf(x, db):
    y = _fft_gain(x, lambda f: low_shelf_db(f, 120.0, -abs(db)))
    return y, {"measured_db_40_100hz": _band_rms_db(y, 40, 100) - _band_rms_db(x, 40, 100),
               "measured_db_500_2k_ctrl": _band_rms_db(y, 500, 2000) - _band_rms_db(x, 500, 2000)}


def d_harsh_bell(x, db):
    y = _fft_gain(x, lambda f: bell_db(f, 3000.0, 6000.0, abs(db)))
    return y, {"measured_db_3_6khz": _band_rms_db(y, 3300, 5500) - _band_rms_db(x, 3300, 5500),
               "measured_db_500_2k_ctrl": _band_rms_db(y, 500, 2000) - _band_rms_db(x, 500, 2000)}


def _onsets(x: np.ndarray) -> np.ndarray:
    """Detected onsets (sample idx): 5 ms envelope jumps >= 6 dB over the 50 ms before."""
    e = _env(x, 5.0)
    lag = int(SR * 0.05)
    prev = np.concatenate([np.full(lag, e[0]), e[:-lag]])
    hit = e > prev * 2.0
    idx = np.flatnonzero(hit & ~np.concatenate([[False], hit[:-1]]))
    keep, last = [], -10**9
    for i in idx:  # dedupe within 40 ms
        if i - last > int(SR * 0.04):
            keep.append(i)
            last = i
    return np.asarray(keep, dtype=int)


def attack_depth_db(x: np.ndarray, y: np.ndarray, t0: float = 0.0, t1: float | None = None) -> float:
    """INDEPENDENT: median over the KNOWN kick grid in [t0,t1] of
    20log10(max|y| / max|x|) in the 0-25 ms after the kick (the attack)."""
    ks = [k for k in kick_times(len(x) / SR) if k >= t0 and (t1 is None or k < t1)]
    r = [20 * np.log10(np.max(np.abs(y[int(k * SR):int((k + 0.025) * SR)])) / (np.max(np.abs(x[int(k * SR):int((k + 0.025) * SR)])) + 1e-12) + 1e-12) for k in ks]
    return float(np.median(r)) if r else 0.0


def d_transient(x, db, section: bool):
    """Transient shaper / slowed attack: a dip of `db` dB starting at every detected
    onset, 25 ms long, so the attack is softened and the body is untouched."""
    n = len(x)
    dip = np.zeros(n)
    shape = (0.5 + 0.5 * np.cos(np.pi * np.arange(int(SR * 0.025)) / int(SR * 0.025)))
    for i in _onsets(x):
        seg = dip[i:i + len(shape)]
        seg[:] = np.maximum(seg, shape[: len(seg)])
    if section:
        dip = dip * _window_gain(n, *SECTION)
    y = (x * (10.0 ** (-abs(db) * dip / 20.0))[:, None]).astype(np.float32)
    t0, t1 = SECTION if section else (0.0, None)
    return y, {"measured_attack_depth_db": attack_depth_db(x, y, t0, t1), "n_onsets": int(len(_onsets(x))), "section_s": list(SECTION) if section else None}


def _clip_to_rate(x: np.ndarray, rate: float, t0=0.0, t1=None) -> tuple[np.ndarray, dict]:
    a, b = int(t0 * SR), int((t1 if t1 else len(x) / SR) * SR)
    seg = x[a:b]
    thr = float(np.quantile(np.abs(seg), 1.0 - rate))
    y = x.copy()
    y[a:b] = np.clip(seg, -thr, thr)
    clipped = float(np.mean(np.abs(seg) > thr * 0.99999))
    lin = np.sum(y[a:b] * seg) / np.sum(seg * seg)  # best linear gain
    resid = y[a:b] - lin * seg
    thd_db = float(10 * np.log10(np.sum(resid**2) / np.sum((lin * seg) ** 2) + 1e-20))
    return y, {"clip_rate_in_region": clipped, "residual_vs_linear_db": thd_db, "region_s": [a / SR, b / SR]}


def d_clip(x, rate, burst: bool):
    if burst:
        t0 = 6.0
        return _clip_to_rate(x, rate, t0, t0 + BURST_S)
    return _clip_to_rate(x, rate)


def d_clip_fullscale(x, gain_db):
    y = np.clip(x * 10.0 ** (gain_db / 20.0), -1.0, 1.0).astype(np.float32)
    return y, {"clip_rate": float(np.mean(np.abs(y) >= 0.9999)), "gain_db": gain_db}


def d_pumping(x, db):
    """Kick-correlated broadband gain duck: instant dip of `db` at each kick, 120 ms recovery."""
    n = len(x)
    g = np.zeros(n)
    tail = np.exp(-np.arange(int(SR * 0.8)) / (SR * 0.12))
    for k in kick_times(n / SR):
        a = int(k * SR)
        seg = g[a:a + len(tail)]
        seg[:] = np.maximum(seg, tail[: len(seg)])
    gain = 10.0 ** (-abs(db) * g / 20.0)
    y = (x * gain[:, None]).astype(np.float32)
    # INDEPENDENT: processed/source RMS ratio 0-30 ms after kicks vs 300-450 ms after
    def rms(z, a, b):
        return np.sqrt(np.mean(z[int(a * SR):int(b * SR)] ** 2) + 1e-20)
    kd, cd = [], []
    hy, hx = _hp(y), _hp(x)
    for k in kick_times(n / SR)[1:-1]:
        kd.append(20 * np.log10(rms(hy, k, k + 0.03) / rms(hx, k, k + 0.03)))
        cd.append(20 * np.log10(rms(hy, k + 0.3, k + 0.45) / rms(hx, k + 0.3, k + 0.45)))
    return y, {"measured_hf_dip_db": float(np.median(kd) - np.median(cd)), "kick_dip_db": float(np.median(kd))}


def _hp(x: np.ndarray, hz: float = 2000.0) -> np.ndarray:
    return sosfiltfilt(butter(4, hz, "high", fs=SR, output="sos"), _mono(x))


def d_polarity(x):
    y = x.copy()
    y[:, 1] *= -1.0
    return y, {"correlation": float(np.corrcoef(y[:, 0], y[:, 1])[0, 1])}


def d_phase_cancel(x, k):
    y = x.copy()
    y[:, 1] = (1.0 - k) * x[:, 1] - k * x[:, 0]
    return y, {"correlation": float(np.corrcoef(y[:, 0], y[:, 1])[0, 1]), "k": k}


def d_width(x, side_db):
    m, s = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    s = s * 10.0 ** (side_db / 20.0)
    y = np.stack([m + s, m - s], axis=1).astype(np.float32)
    return y, {"side_over_mid_db": float(20 * np.log10(np.std(s) / (np.std(m) + 1e-12))), "correlation": float(np.corrcoef(y[:, 0], y[:, 1])[0, 1])}


def d_mono_fold(x):
    m = x.mean(axis=1)
    return np.stack([m, m], axis=1).astype(np.float32), {"correlation": 1.0}


def short_crest_db(x: np.ndarray) -> float:
    """INDEPENDENT median 400 ms block crest (peak/RMS) in dB."""
    n = int(SR * 0.4)
    m = _mono(x)
    k = len(m) // n
    b = m[: k * n].reshape(k, n)
    return float(np.median(20 * np.log10(np.max(np.abs(b), 1) / (np.sqrt(np.mean(b**2, 1)) + 1e-12))))


def level_range_db(x: np.ndarray) -> float:
    """INDEPENDENT loudness-range proxy: p95-p10 of 1 s RMS (dB)."""
    n = SR
    m = _mono(x)
    k = len(m) // n
    r = 20 * np.log10(np.sqrt(np.mean(m[: k * n].reshape(k, n) ** 2, 1)) + 1e-12)
    return float(np.percentile(r, 95) - np.percentile(r, 10))


def _peak_limit(x: np.ndarray, thr: float, look_ms=2.0, rel_ms=60.0) -> np.ndarray:
    """Vectorised look-ahead peak limiter: max-hold over the look-ahead window,
    smoothed so gain changes are click-free, then a slow release."""
    pk = np.max(np.abs(x), axis=1).astype(np.float64)
    w = max(3, int(SR * look_ms / 1000.0))
    hold = maximum_filter1d(pk, size=2 * w, mode="nearest")
    env = uniform_filter1d(hold, w, mode="nearest")
    env = np.maximum(env, hold * 0.0 + env)
    g = np.minimum(1.0, thr / (env + 1e-12))
    # release smoothing (min-hold then average keeps g <= peak-safe approx)
    g = uniform_filter1d(minimum_filter1d(g, size=w, mode="nearest"), int(SR * rel_ms / 1000.0) // 4 + 1, mode="nearest")
    return (x * g[:, None]).astype(np.float32)


def d_crest_crush(x, target_db):
    """Bisect the limiter threshold until the short-term crest falls by target_db."""
    c0 = short_crest_db(x)
    lo, hi = 0.005, float(np.max(np.abs(x)))
    y = x
    for _ in range(9):
        thr = np.sqrt(lo * hi)
        y = _peak_limit(x, thr)
        if c0 - short_crest_db(y) > target_db:
            lo = thr
        else:
            hi = thr
    y = _peak_limit(x, np.sqrt(lo * hi))
    return y, {"crest_drop_db": c0 - short_crest_db(y), "crest_before_db": c0, "level_range_drop_db": level_range_db(x) - level_range_db(y)}


def d_range_crush(x, ratio):
    """Slow downward compression of the 400 ms level toward its median (LRA squash)."""
    env = _env(x, 400.0)
    ref = np.median(env)
    g = (env / ref) ** (-(1.0 - 1.0 / ratio))
    y = (x * g[:, None]).astype(np.float32)
    return y, {"level_range_drop_db": level_range_db(x) - level_range_db(y), "crest_drop_db": short_crest_db(x) - short_crest_db(y), "ratio": ratio}


def d_dc(x, dc):
    y = (x + dc).astype(np.float32)
    return y, {"mean_dc": float(np.mean(y)), "dc_dbfs": float(20 * np.log10(abs(np.mean(y)) + 1e-12))}


def d_isp(x, tp_db):
    """Inter-sample peak: two adjacent equal samples of height a reconstruct to a peak of
    ~1.273*a between them (2*sinc(0.5)), so a = 10^(tp/20)/1.273 keeps every SAMPLE
    below full scale (a < 0.9999 for tp <= 2.1 dB) while the TRUE peak is ~tp dBTP.
    Only two samples change, so there is no spectral side effect to confound the test."""
    a_ = 10.0 ** (tp_db / 20.0) / 1.2732
    y = x.copy()
    i = int(6.0 * SR)
    y[i : i + 2, :] = a_
    return y, {"sample_peak_db": float(20 * np.log10(np.max(np.abs(y)))), "true_peak_db_indep": true_peak_db_indep(y)}


def d_tp_over(x, over_db):
    """Plain over: gain so the sample peak is +over_db (float, unclipped)."""
    pk = float(np.max(np.abs(x)))
    y = (x * (10.0 ** (over_db / 20.0) / pk)).astype(np.float32)
    return y, {"sample_peak_db": float(20 * np.log10(np.max(np.abs(y)))), "true_peak_db_indep": true_peak_db_indep(y)}


def d_gain(x, db):
    y = (x * 10.0 ** (db / 20.0)).astype(np.float32)
    return y, {"lufs_change_db": _lufs(y) - _lufs(x)}


# ------------------------------------------------------------------ taxonomy
# class -> what the gate SHOULD notice (used by the scorecard for TPR)
CLASSES = {
    "low_end_loss": "bass lost relative to the mix",
    "harsh_highs": "upper bands boosted relative to the mix",
    "transient_smear": "attacks softened (global)",
    "transient_smear_section": "attacks softened in one 4 s section only",
    "clip_distortion": "hard-clip distortion over the whole file",
    "clip_burst": f"hard-clip distortion in one {int(BURST_S*1000)} ms burst",
    "clip_fullscale": "full-scale (>= 0.9999) clipped samples",
    "pumping": "kick-correlated broadband gain ducking",
    "polarity_inverted": "one channel polarity-inverted",
    "phase_cancel": "partial inter-channel phase cancellation",
    "excess_width": "side-channel boosted (excessive width)",
    "crest_crush": "peak/crest reduced by a fast limiter",
    "range_crush": "slow level range (LRA) squashed",
    "dc_offset": "DC offset on both channels",
    "true_peak_isp": "inter-sample peak over (sample peak < 0.9999)",
    "true_peak_over": "plain overshoot above full scale",
    "bass_heavy_clean": "CONTROL: loud intentionally bass-heavy but clean, pure level change",
    "pure_gain": "CONTROL: pure gain change only",
    "identity": "CONTROL: processed == source",
    "mono_fold": "CONTROL: mono-compatible fold-down of a clean mix",
}


def build_cases(references=None, quick: bool = False) -> list[Case]:
    refs = list(references or (QUICK_REFERENCES if quick else REFERENCES))
    cases: list[Case] = []

    def add(ref, src, cls, label, dose, unit, variant, fn_out):
        y, inj = fn_out
        cid = f"{ref}:{cls}:{variant}:{dose if dose is not None else 'na'}"
        cases.append(Case(cid, ref, cls, label, dose, unit, variant, src, y, inj))

    for ref in refs:
        x = make_reference(ref)
        # --- controls
        add(ref, x, "identity", "control", 0.0, "dB", "global", (x.copy(), {}))
        for g in (-3.0, 3.0):
            add(ref, x, "pure_gain", "control", g, "dB", "global", d_gain(x, g))
        add(ref, x, "mono_fold", "control", None, "", "global", d_mono_fold(x))
        if quick:
            doses = dict(low=(6,), harsh=(6,), tr=(6,), clip=(0.02,), pump=(2,), width=(12,), crest=(4,), rng=(6,), dc=(0.02,))
        else:
            doses = dict(low=(2, 4, 6), harsh=(2, 4, 6), tr=(3, 6, 9), clip=(0.005, 0.02, 0.08), pump=(1, 2, 4), width=(6, 12, 18), crest=(2, 4, 8), rng=(3.0, 6.0, 12.0), dc=(0.005, 0.02, 0.1))
        # --- spectral
        for d in doses["low"]:
            y, inj = d_low_shelf(x, d)
            add(ref, x, "low_end_loss", "defect", float(d), "dB", "global", (y, inj))
            add(ref, x, "low_end_loss", "defect", float(d), "dB", "loudness_matched", (match_loudness(y, x), inj))
        for d in doses["harsh"]:
            y, inj = d_harsh_bell(x, d)
            add(ref, x, "harsh_highs", "defect", float(d), "dB", "global", (y, inj))
            add(ref, x, "harsh_highs", "defect", float(d), "dB", "loudness_matched", (match_loudness(y, x), inj))
        # --- transients
        for d in doses["tr"]:
            add(ref, x, "transient_smear", "defect", float(d), "dB", "global", d_transient(x, d, False))
            add(ref, x, "transient_smear_section", "defect", float(d), "dB", "section", d_transient(x, d, True))
        # --- distortion
        for r in doses["clip"]:
            add(ref, x, "clip_distortion", "defect", r, "clip_rate", "global", d_clip(x, r, False))
            add(ref, x, "clip_burst", "defect", r * 10 if r * 10 < 0.5 else 0.5, "clip_rate_in_burst", "burst", d_clip(x, min(r * 10, 0.5), True))
        add(ref, x, "clip_fullscale", "defect", 6.0, "dB_over", "global", d_clip_fullscale(x, 6.0 + (-20 * np.log10(REF_PEAK))))
        # --- pumping
        for d in doses["pump"]:
            add(ref, x, "pumping", "defect", float(d), "dB", "global", d_pumping(x, d))
        # --- stereo
        add(ref, x, "polarity_inverted", "defect", 180.0, "deg", "global", d_polarity(x))
        for k in ((0.25, 0.5) if not quick else (0.5,)):
            add(ref, x, "phase_cancel", "defect", k, "k", "global", d_phase_cancel(x, k))
        for d in doses["width"]:
            add(ref, x, "excess_width", "defect", float(d), "dB", "global", d_width(x, d))
        # --- dynamics
        for d in doses["crest"]:
            add(ref, x, "crest_crush", "defect", float(d), "dB", "global", d_crest_crush(x, d))
        for r in doses["rng"]:
            add(ref, x, "range_crush", "defect", float(r), "ratio", "global", d_range_crush(x, r))
        # --- integrity
        for dc in doses["dc"]:
            add(ref, x, "dc_offset", "defect", dc, "fs", "global", d_dc(x, dc))
        for tp in ((0.5, 1.0, 2.0) if not quick else (2.0,)):
            add(ref, x, "true_peak_isp", "defect", tp, "dBTP", "global", d_isp(x, tp))
        for ov in ((1.0, 3.0) if not quick else (1.0,)):
            add(ref, x, "true_peak_over", "defect", ov, "dBFS", "global", d_tp_over(x, ov))
    return cases


if __name__ == "__main__":
    import json
    cs = build_cases(quick="--quick" in sys.argv)
    print(json.dumps([c.meta() for c in cs[:5]], indent=1, default=float))
    print(len(cs), "cases")
