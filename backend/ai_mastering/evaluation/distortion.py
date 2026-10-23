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
from scipy.signal import correlate

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


def added_distortion_db(source: np.ndarray, master: np.ndarray, sr: int) -> dict:
    x, y, lag = _align(_mid(source), _mid(master), sr)
    if x.size < N_FFT * 4:
        return {"mid_500_4k": -120.0, "hf_4k_16k": -120.0, "worst_db": -120.0, "lag_samples": lag}
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
    return out
