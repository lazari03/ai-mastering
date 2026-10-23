"""Vectorised ITU-R BS.1770 / EBU R128 loudness.

Drop-in replacement for pyloudnorm.Meter's integrated_loudness and
loudness_range with the SAME block boundaries, gates and constants (see
pyloudnorm/meter.py), but:

* K-weighting is applied once per call for all channels (one sosfilt
  pass along axis 0) instead of per channel inside a Python loop;
* block mean-squares come from a cumulative sum instead of a Python loop
  over every block;
* momentary (400 ms / 100 ms) and short-term (3 s / 1 s) series reuse ONE
  K-weighted signal and one set of 400 ms block powers, instead of calling
  integrated_loudness thousands of times on re-filtered chunks.

On a 3.5-minute song the legacy series loops alone cost ~20 s.
"""

from __future__ import annotations

import warnings

import numpy as np
import pyloudnorm as pyln
from scipy.signal import sosfilt

_CHANNEL_GAINS = np.array([1.0, 1.0, 1.0, 1.41, 1.41])
_ABS_GATE = -70.0


def _as_2d(data: np.ndarray) -> np.ndarray:
    data = np.asarray(data, dtype=np.float64)
    return data[:, np.newaxis] if data.ndim == 1 else data


class FastMeter:
    """Interface-compatible subset of pyloudnorm.Meter."""

    def __init__(self, rate: int, block_size: float = 0.400, overlap: float = 0.75):
        self.rate = rate
        self.block_size = block_size
        self.overlap = overlap
        # pyloudnorm's two K-weighting biquads (high shelf, high pass) as one
        # second-order-sections cascade: a single vectorised pass.
        self._sos = np.vstack([np.concatenate([f.b, f.a]) for f in pyln.Meter(rate)._filters.values()])
        self.blockwise_loudness: list[float] = []

    def k_weight(self, data: np.ndarray) -> np.ndarray:
        return sosfilt(self._sos, _as_2d(data), axis=0)

    def _block_powers(self, weighted: np.ndarray, block_size: float, overlap: float) -> np.ndarray:
        """z[ch, j] exactly as pyloudnorm computes it (same float
        expressions for the block bounds, slices truncated at the end)."""
        n, ch = weighted.shape
        step = 1.0 - overlap
        t = n / self.rate
        num_blocks = int(np.round(((t - block_size) / (block_size * step)))) + 1
        j = np.arange(num_blocks)
        lo = np.array([int(block_size * (jj * step) * self.rate) for jj in j])
        hi = np.array([int(block_size * (jj * step + 1) * self.rate) for jj in j])
        cs = np.vstack([np.zeros((1, ch)), np.cumsum(weighted * weighted, axis=0)])
        lo_c = np.clip(lo, 0, n)
        hi_c = np.clip(hi, 0, n)
        return ((cs[hi_c] - cs[lo_c]) / (block_size * self.rate)).T

    @staticmethod
    def _gated(z: np.ndarray) -> tuple[float, np.ndarray]:
        g = _CHANNEL_GAINS[: z.shape[0], np.newaxis]
        with np.errstate(divide="ignore", invalid="ignore"):
            block_l = -0.691 + 10.0 * np.log10(np.sum(g * z, axis=0))
        above_abs = block_l >= _ABS_GATE
        if not np.any(above_abs):
            return float("-inf"), block_l
        z_abs = z[:, above_abs].mean(axis=1)
        gamma_r = -0.691 + 10.0 * np.log10(np.sum(_CHANNEL_GAINS[: z.shape[0]] * z_abs)) - 10.0
        keep = (block_l > gamma_r) & (block_l > _ABS_GATE)
        if not np.any(keep):
            return float("-inf"), block_l
        z_avg = z[:, keep].mean(axis=1)
        with np.errstate(divide="ignore"):
            return float(-0.691 + 10.0 * np.log10(np.sum(_CHANNEL_GAINS[: z.shape[0]] * z_avg))), block_l

    def integrated_loudness(self, data: np.ndarray) -> float:
        data = _as_2d(data)
        if data.shape[0] < self.block_size * self.rate:
            raise ValueError("Audio must have length greater than the block size.")
        z = self._block_powers(self.k_weight(data), self.block_size, self.overlap)
        value, block_l = self._gated(z)
        self.blockwise_loudness = list(block_l)
        return value

    def loudness_range(self, data: np.ndarray) -> float:
        data = _as_2d(data)
        data = np.concatenate([data, np.zeros((int(1.5 * self.rate), data.shape[1]))], axis=0)
        if data.shape[0] < 3.0 * self.rate:
            raise ValueError("Audio must have length greater than the block size.")
        z = self._block_powers(self.k_weight(data), 3.0, 0.97)
        g = _CHANNEL_GAINS[: z.shape[0], np.newaxis]
        with np.errstate(divide="ignore"):
            stl = -0.691 + 10.0 * np.log10(np.sum(g * z, axis=0))
        stl = stl[stl >= _ABS_GATE]
        if stl.size == 0:
            return float("nan")
        integrated = 10.0 * np.log10(np.mean(10.0 ** (stl / 10.0)))
        rel = stl[stl >= integrated - 20.0]
        if rel.size == 0:
            return float("nan")
        return float(np.percentile(rel, 95) - np.percentile(rel, 10))


def loudness_series(audio: np.ndarray, sr: int) -> tuple[list[float], list[float]]:
    """(momentary, short_term) series with the legacy windowing:
    momentary = 400 ms windows every 100 ms (ungated single block);
    short-term = 3 s windows every 1 s, gated like integrated loudness
    over the 400 ms blocks inside each window. Non-finite values dropped."""
    meter = FastMeter(sr)
    data = _as_2d(audio)
    n = data.shape[0]
    w = meter.k_weight(data)
    cs = np.vstack([np.zeros((1, data.shape[1])), np.cumsum(w * w, axis=0)])
    blk = int(0.4 * sr)
    hop = int(0.1 * sr)
    starts = np.arange(0, max(n - blk + 1, 0), hop)
    z = ((cs[starts + blk] - cs[starts]) / (0.4 * sr)).T  # (ch, blocks)
    g = _CHANNEL_GAINS[: z.shape[0], np.newaxis]
    with np.errstate(divide="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore")
        momentary = -0.691 + 10.0 * np.log10(np.sum(g * z, axis=0))
    momentary_list = [float(v) for v in momentary if np.isfinite(v) and v >= _ABS_GATE]

    short = []
    st_hop = int(1.0 * sr)
    st_len = int(3.0 * sr)
    per_window = int(np.round((3.0 - 0.4) / 0.1)) + 1  # 27 blocks per 3 s window
    ratio = st_hop // hop if hop else 10
    for m, start in enumerate(range(0, max(n - st_len + 1, 0), st_hop)):
        j0 = m * ratio
        zz = z[:, j0 : j0 + per_window]
        if zz.shape[1] == 0:
            continue
        value, _ = FastMeter._gated(zz)
        if np.isfinite(value):
            short.append(value)
    return momentary_list, short


def _bounds(n_blocks: int, block_size: float, step: float, rate: int) -> tuple[np.ndarray, np.ndarray]:
    j = np.arange(n_blocks)
    lo = np.array([int(block_size * (jj * step) * rate) for jj in j], dtype=np.int64)
    hi = np.array([int(block_size * (jj * step + 1) * rate) for jj in j], dtype=np.int64)
    return lo, hi


def full_loudness_analysis(audio: np.ndarray, sr: int) -> dict:
    """Integrated loudness, LRA, momentary and short-term series from ONE
    K-weighting pass and ONE cumulative sum (each used to re-filter the
    whole song). Block bounds/gates identical to FastMeter/pyloudnorm; the
    1.5 s of silence pyloudnorm appends for LRA contributes zero energy, so
    it is represented by clipping block bounds at the signal end."""
    meter = FastMeter(sr)
    data = _as_2d(audio)
    n, ch = data.shape
    w = meter.k_weight(data)
    cs = np.empty((n + 1, ch))
    cs[0] = 0.0
    np.cumsum(w * w, axis=0, out=cs[1:])
    del w

    out = {"integrated_lufs": float("-inf"), "loudness_range_lu": float("nan"), "momentary": [], "short_term": []}
    if n >= 0.4 * sr:
        t = n / sr
        nb = int(np.round((t - 0.4) / (0.4 * 0.25))) + 1
        lo, hi = _bounds(nb, 0.4, 1.0 - 0.75, sr)
        z = ((cs[np.clip(hi, 0, n)] - cs[np.clip(lo, 0, n)]) / (0.4 * sr)).T
        out["integrated_lufs"], _ = FastMeter._gated(z)

    n_ext = n + int(1.5 * sr)
    if n_ext >= 3.0 * sr:
        step = 1.0 - 0.97
        nb = int(np.round(((n_ext / sr) - 3.0) / (3.0 * step))) + 1
        lo, hi = _bounds(nb, 3.0, step, sr)
        z = ((cs[np.clip(hi, 0, n)] - cs[np.clip(lo, 0, n)]) / (3.0 * sr)).T
        g = _CHANNEL_GAINS[:ch, np.newaxis]
        with np.errstate(divide="ignore"):
            stl = -0.691 + 10.0 * np.log10(np.sum(g * z, axis=0))
        stl = stl[stl >= _ABS_GATE]
        if stl.size:
            integ = 10.0 * np.log10(np.mean(10.0 ** (stl / 10.0)))
            rel = stl[stl >= integ - 20.0]
            if rel.size:
                out["loudness_range_lu"] = float(np.percentile(rel, 95) - np.percentile(rel, 10))

    blk, hop = int(0.4 * sr), int(0.1 * sr)
    starts = np.arange(0, max(n - blk + 1, 0), hop)
    if starts.size:
        z = ((cs[starts + blk] - cs[starts]) / (0.4 * sr)).T
        g = _CHANNEL_GAINS[:ch, np.newaxis]
        with np.errstate(divide="ignore"):
            mom = -0.691 + 10.0 * np.log10(np.sum(g * z, axis=0))
        out["momentary"] = [float(v) for v in mom if np.isfinite(v) and v >= _ABS_GATE]
        per_window = int(np.round((3.0 - 0.4) / 0.1)) + 1
        ratio = int(sr) // hop if hop else 10
        for m, _start in enumerate(range(0, max(n - int(3.0 * sr) + 1, 0), int(sr))):
            zz = z[:, m * ratio : m * ratio + per_window]
            if zz.shape[1]:
                value, _ = FastMeter._gated(zz)
                if np.isfinite(value):
                    out["short_term"].append(value)
    return out
