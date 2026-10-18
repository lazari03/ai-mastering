"""Added (nonlinear) distortion: energy in the master that no slowly
varying linear processing of the source can explain.

Model, per STFT frame t and frequency f:

    Y(f, t) ~= g_band(t) * H(f) * X(f, t)

* H(f)        — one static complex response for the whole song: every EQ,
                filter and fixed phase shift the chain applies;
* g_band(t)   — one real gain per frame per broad band: compression,
                multiband compression, dynamic EQ, de-essing and the
                limiter's frame-rate gain riding;
* the residual — clipping/saturation harmonics, intermodulation, and gain
                modulation fast enough to change within a frame (hard
                limiting). That is the "distortion" a listener hears as
                grit, crunch or smeared transients.

Reported as residual-to-master energy in dB per region, over loud frames
only (silence/fades excluded). The signals are aligned by cross-correlation
first: a few samples of latency alone would read as -20 dB of "distortion".

Measured on synthetic material (tests/synthetic.py): an unprocessed copy
reads ~-118 dB, a typical plan with ~4.5 dB of limiting -22..-26 dB, heavy
limiting / 2x the planner's maximum saturation drive -16..-19 dB, heavy
saturation -8..-10 dB. The verdict threshold (config.MAX_ADDED_DISTORTION_DB)
is provisional until calibrated on the real-track corpus
(benchmark/regression.py reports its headroom per track).
"""

from __future__ import annotations

import librosa
import numpy as np
from scipy.signal import butter, correlate, sosfiltfilt

from ..planning import config as C

EPS = 1e-12
N_FFT = 2048
HOP = 512
# Bands for the per-frame gain fit: about an octave each, so multiband
# compression (4-5 bands) and dynamic EQ are absorbed as "gain", not
# counted as distortion.
GAIN_BANDS_HZ = (20.0, 60.0, 120.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 24000.0)
REGIONS_HZ = {"mid_500_4k": (500.0, 4000.0), "hf_4k_16k": (4000.0, 16000.0)}
LOUD_FRAME_REL_DB = -40.0
MAX_ALIGN_LAG = 4096
ALIGN_WINDOW_S = 8.0


def _mid(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    return x if x.ndim == 1 else x.mean(axis=1)


def _align(x: np.ndarray, y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, int]:
    n = min(x.size, y.size, int(sr * ALIGN_WINDOW_S))
    start = max(0, min(x.size, y.size) // 2 - n // 2)
    c = correlate(y[start : start + n], x[start : start + n], mode="full", method="fft")
    mid = n - 1
    lo, hi = max(0, mid - MAX_ALIGN_LAG), min(c.size, mid + MAX_ALIGN_LAG + 1)
    lag = int(np.argmax(np.abs(c[lo:hi]))) + lo - mid
    if lag > 0:
        y = y[lag:]
    elif lag < 0:
        x = x[-lag:]
    m = min(x.size, y.size)
    return x[:m], y[:m], lag


def _windowed_worst_db(pr: np.ndarray, py: np.ndarray, f: np.ndarray, loud: np.ndarray, sr: int) -> dict:
    """Residual-to-master dB per region over sliding windows of loud frames;
    returns the worst window. A whole-song ratio dilutes a short event by
    its share of the song (a 300 ms hard-clip burst in 12 s read 23 dB
    below its own level, AURALITH-AUDIO-007)."""
    wf = max(1, int(round(C.DISTORTION_WINDOW_S * sr / HOP)))
    hf = max(1, int(round(C.DISTORTION_WINDOW_HOP_S * sr / HOP)))
    out: dict = {}
    n = loud.size
    for name, (lo, hi) in REGIONS_HZ.items():
        m = (f >= lo) & (f < min(hi, sr / 2.0))
        num = np.where(loud, pr[m].sum(axis=0), 0.0)
        den = np.where(loud, py[m].sum(axis=0), 0.0)
        cn, cd, cl = (np.concatenate([[0.0], np.cumsum(v)]) for v in (num, den, loud.astype(np.float64)))
        starts = np.arange(0, max(1, n - wf + 1), hf)
        ends = np.minimum(starts + wf, n)
        w_num, w_den, w_loud = cn[ends] - cn[starts], cd[ends] - cd[starts], (cl[ends] - cl[starts]) / np.maximum(ends - starts, 1)
        ok = (w_loud >= 0.5) & (w_den > EPS)
        if not np.any(ok):
            out[name] = -120.0
            continue
        vals = 10.0 * np.log10(w_num[ok] / w_den[ok] + EPS)
        i = int(np.argmax(vals))
        out[name] = round(float(vals[i]), 2)
        out[name + "_at_s"] = round(float(starts[ok][i] * HOP / sr), 2)
    worst_region = max(REGIONS_HZ, key=lambda k: out[k])
    return {"window_worst_db": out[worst_region], "window_worst_at_s": out.get(worst_region + "_at_s"), "window_regions_db": {k: out[k] for k in REGIONS_HZ}}


def _pumping_db(x: np.ndarray, y: np.ndarray, sr: int) -> float:
    """Low-band-correlated gain modulation of the master relative to the
    source: how much the master's 2-8 kHz band dips, relative to the
    source's, on the frames where the SOURCE's 40-120 Hz band is loudest
    (kicks / bass notes, top 10 %) compared with its quietest half. The
    same construction as benchmark.metrics.pumping_db (which measured the
    injected dip within 0.15 dB on the defect corpus), on aligned signals.
    Positive dB = the highs duck when the low end hits; ~0 = no pumping.
    A static gain or EQ cancels (the same offset on both frame sets)."""
    frame = max(1, int(sr * 0.01))
    n = (min(x.size, y.size) // frame) * frame
    if n < frame * 100 or sr / 2.0 <= 8100.0:
        return 0.0

    def env(sig: np.ndarray, lo: float, hi: float) -> np.ndarray:
        sos = butter(4, [lo, min(hi, sr / 2.0 - 100.0)], btype="band", fs=sr, output="sos")
        band = sosfiltfilt(sos, sig[:n].astype(np.float64))
        return 10.0 * np.log10(np.mean(band.reshape(-1, frame) ** 2, axis=1) + 1e-18)

    low = env(x, 40.0, 120.0)
    hf_src, hf_out = env(x, 2000.0, 8000.0), env(y, 2000.0, 8000.0)
    audible = hf_src > np.max(hf_src) - 50.0
    if np.count_nonzero(audible) < 50:
        return 0.0
    change, low = (hf_out - hf_src)[audible], low[audible]
    kick, calm = low >= np.percentile(low, 90), low <= np.percentile(low, 50)
    if not np.any(kick) or not np.any(calm):
        return 0.0
    return round(float(np.median(change[calm]) - np.median(change[kick])), 2)


def _section_attack_loss_db(x: np.ndarray, y: np.ndarray, sr: int) -> dict:
    """Section-local transient loss (AURALITH-AUDIO-007).

    At every attack the SOURCE has (10 ms envelope rising > 6 dB, 6 dB
    above its sustained level - the same onset rule as the punch score),
    the master's gain on the attack (first 20 ms) is compared with its
    gain on the body right after (40-150 ms): a ratio of ratios, so level,
    EQ and slow gain riding cancel and only a softened attack remains.
    Onsets are fixed on the source, so a master cannot make an onset
    "disappear" from the statistic (the global punch score's weakness).

    Returned: the median attack change over the song and over each
    TRANSIENT_WINDOW_S window; `section_attack_loss_db` is how much worse
    the worst window is than the song as a whole. A limiter that softens
    every hit alike (normal mastering, -1.5..-2.5 dB here) scores ~0; a
    section whose drums were smeared on their own scores its extra loss."""
    out = {"section_attack_loss_db": 0.0, "attack_change_db": 0.0, "section_attack_worst_db": 0.0, "section_attack_at_s": None}
    frame = max(1, int(sr * 0.01))
    n = min(x.size, y.size)
    if n < frame * 100:
        return out
    xs = x[:n].astype(np.float64) - float(np.mean(x[:n]))
    ys = y[:n].astype(np.float64) - float(np.mean(y[:n]))
    nf = n // frame
    env = 10.0 * np.log10(np.mean(xs[: nf * frame].reshape(nf, frame) ** 2, axis=1) + 1e-18)
    rise = np.diff(env, prepend=env[0])
    base = float(np.percentile(env, 40.0))
    cand = np.flatnonzero((rise > 6.0) & (env > base + 6.0))
    a1, b0, b1 = int(0.02 * sr), int(0.04 * sr), int(0.15 * sr)
    times, change, last = [], [], -10**9
    for i in cand:
        if i - last < 5:  # one attack per 50 ms
            continue
        last = i
        s0 = max(0, (i - 1) * frame)
        if s0 + b1 >= n:
            break
        def rms(z: np.ndarray, p: int, q: int) -> float:
            return float(np.sqrt(np.mean(z[s0 + p : s0 + q] ** 2) + 1e-20))
        att = rms(ys, 0, a1) / rms(xs, 0, a1)
        body = rms(ys, b0, b1) / rms(xs, b0, b1)
        change.append(20.0 * np.log10(att / body))
        times.append(s0 / sr)
    if len(change) < 6:
        return out
    t, c = np.asarray(times), np.asarray(change)
    win, hop = C.TRANSIENT_WINDOW_S, C.TRANSIENT_WINDOW_HOP_S
    vals, starts, s = [], [], 0.0
    while s + win <= n / sr + 1e-9:
        m = (t >= s) & (t < s + win)
        if np.count_nonzero(m) >= C.TRANSIENT_WINDOW_MIN_ONSETS:
            vals.append(float(np.median(c[m])))
            starts.append(s)
        s += hop
    song = float(np.median(c))
    out["attack_change_db"] = round(song, 2)
    if len(vals) < 2:
        return out
    k = int(np.argmin(vals))
    out["section_attack_worst_db"] = round(vals[k], 2)
    out["section_attack_at_s"] = round(starts[k], 2)
    out["section_attack_loss_db"] = round(max(song - vals[k], 0.0), 2)
    return out


def added_distortion_db(source: np.ndarray, master: np.ndarray, sr: int) -> dict:
    """Source-vs-master comparison on the aligned signals. Keys:

    worst_db           whole-song residual-to-master dB (the original check)
    window_worst_db    the same ratio in the worst DISTORTION_WINDOW_S window
                       (short bursts; AURALITH-AUDIO-007)
    pumping_db         low-band-correlated HF ducking (AURALITH-AUDIO-008)
    section_attack_loss_db  extra attack softening in the worst section
                       relative to the song (AURALITH-AUDIO-007)
    """
    x, y, lag = _align(_mid(source), _mid(master), sr)
    if x.size < N_FFT * 4:
        out = {"mid_500_4k": -120.0, "hf_4k_16k": -120.0, "worst_db": -120.0, "lag_samples": lag}
        if C.WINDOWED_DISTORTION_CHECK:
            out.update(window_worst_db=-120.0, window_worst_at_s=None)
        if C.PUMPING_CHECK:
            out["pumping_db"] = 0.0
        if C.SECTION_TRANSIENT_CHECK:
            out.update(_section_attack_loss_db(x, y, sr))
        return out
    X = librosa.stft(x, n_fft=N_FFT, hop_length=HOP)
    Y = librosa.stft(y, n_fft=N_FFT, hop_length=HOP)
    f = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    H = np.sum(Y * np.conj(X), axis=1) / (np.sum(np.abs(X) ** 2, axis=1) + EPS)
    Z = H[:, None] * X
    R = np.zeros_like(Y)
    for lo, hi in zip(GAIN_BANDS_HZ[:-1], GAIN_BANDS_HZ[1:]):
        m = (f >= lo) & (f < hi)
        if not np.any(m):
            continue
        g = np.sum(np.real(Y[m] * np.conj(Z[m])), axis=0) / (np.sum(np.abs(Z[m]) ** 2, axis=0) + EPS)
        R[m] = Y[m] - g[None, :] * Z[m]
    py, pr = np.abs(Y) ** 2, np.abs(R) ** 2
    frame = py.sum(axis=0)
    loud = 10.0 * np.log10(frame + EPS) >= 10.0 * np.log10(frame.max() + EPS) + LOUD_FRAME_REL_DB
    out: dict = {"lag_samples": lag}
    for name, (lo, hi) in REGIONS_HZ.items():
        m = (f >= lo) & (f < min(hi, sr / 2.0))
        num, den = float(pr[m][:, loud].sum()), float(py[m][:, loud].sum())
        out[name] = round(10.0 * np.log10(num / den + EPS), 2) if den > EPS else -120.0
    out["worst_db"] = max(out[k] for k in REGIONS_HZ)
    # Each detector runs only when its verdict check is switched on: off
    # means the parent's computation AND payload (no extra keys, no CPU).
    if C.WINDOWED_DISTORTION_CHECK:
        out.update(_windowed_worst_db(pr, py, f, loud, sr))
    if C.PUMPING_CHECK:
        out["pumping_db"] = _pumping_db(x, y, sr)
    if C.SECTION_TRANSIENT_CHECK:
        out.update(_section_attack_loss_db(x, y, sr))
    return out
