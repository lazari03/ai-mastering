"""High-resolution, shared spectral analysis.

ONE chunked STFT pass over the mid and side channels produces everything
spectral the engine needs, so no metric re-transforms the whole song on
its own:

* absolute per-band level (dB) on ~23 log-spaced bands (planning.config
  HIRES_BAND_EDGES_HZ), clipped to Nyquist;
* the "relative spectrum": per-octave level normalised to the 300-3000 Hz
  region, so pink noise reads flat and a genre/neutral target curve can be
  compared to it directly;
* temporal persistence statistics (percentiles of the per-segment relative
  spectrum) — the evidence that a deviation is a stable property of the
  recording rather than one loud section;
* per-band and per-region stereo width / correlation estimates;
* legacy 7-band energy shares (the old `spectral_balance` field), centroid,
  85% rolloff, tilt;
* persistent narrow resonances (dynamic-EQ targets);
* lossy-codec low-pass detection.

Sibilance evidence needs ~20 ms time resolution, which a spectral frame of
this size cannot give, so it is computed separately in the time domain
(`sibilance_evidence`) with a handful of vectorised IIR band filters.
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from scipy.signal import butter, sosfilt

from ..planning import config as C

EPS = 1e-12

# The legacy 7-band layout (audio_utils.ANALYSIS_BANDS) — duplicated here
# rather than imported to keep this module free of audio_utils (which
# imports this module).
LEGACY_BANDS: dict[str, tuple[float, float]] = {
    "sub_bass_20_60hz": (20.0, 60.0),
    "bass_60_250hz": (60.0, 250.0),
    "low_mid_250_500hz": (250.0, 500.0),
    "mid_500_2000hz": (500.0, 2000.0),
    "high_mid_2000_4000hz": (2000.0, 4000.0),
    "presence_4000_6000hz": (4000.0, 6000.0),
    "brilliance_6000_20000hz": (6000.0, 20000.0),
}


def band_name(lo: float, hi: float) -> str:
    return f"{int(round(lo))}_{int(round(hi))}hz"


def hires_bands(sr: int) -> list[dict]:
    """Band layout for this sample rate. Bands whose lower edge is at or
    above ~Nyquist are dropped; the top band's upper edge is clipped."""
    nyq = sr / 2.0
    edges = C.HIRES_BAND_EDGES_HZ
    bands = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        if lo >= nyq * 0.97:
            break
        hi_eff = min(float(hi), nyq * 0.995)
        bands.append({"name": band_name(lo, hi), "lo": float(lo), "hi": hi_eff, "center": float(np.sqrt(lo * hi_eff))})
    return bands


def _aggregation_matrix(freqs: np.ndarray, ranges: list[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray]:
    agg = np.zeros((len(ranges), freqs.size), dtype=np.float32)
    counts = np.zeros(len(ranges), dtype=np.int32)
    for i, (lo, hi) in enumerate(ranges):
        idx = (freqs >= lo) & (freqs < hi)
        agg[i, idx] = 1.0
        counts[i] = int(idx.sum())
    return agg, counts


def _resonance_grid(freqs: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    hi = min(C.RESONANCE_MAX_HZ, sr * 0.45)
    n = int(np.floor(12.0 * np.log2(hi / C.RESONANCE_MIN_HZ))) + 1
    grid = C.RESONANCE_MIN_HZ * 2.0 ** (np.arange(n) / 12.0)
    mat = np.zeros((n, freqs.size), dtype=np.float32)
    for i, fg in enumerate(grid):
        idx = np.where((freqs >= fg * 2 ** (-1 / 24)) & (freqs < fg * 2 ** (1 / 24)))[0]
        if idx.size == 0:
            idx = np.array([int(np.argmin(np.abs(freqs - fg)))])
        mat[i, idx] = 1.0 / idx.size
    return grid, mat


def _percentile_cdf(percentile_points: dict, value: float) -> float:
    """Fraction of segments whose value exceeds `value`, interpolated from
    stored percentiles (5..95). Used for persistence without storing the
    full per-segment matrix in the (JSON round-tripped) profile. Outside
    the stored range the CDF is extended linearly to 0 / 1 over a quarter
    of the observed spread."""
    ps = sorted((float(k), float(v)) for k, v in percentile_points.items())
    qs = [p / 100.0 for p, _ in ps]
    vs = [v for _, v in ps]
    spread = max(vs[-1] - vs[0], 1.0) * 0.25
    xs = np.array([vs[0] - spread] + vs + [vs[-1] + spread])
    ys = np.array([0.0] + qs + [1.0])
    xs = np.maximum.accumulate(xs + np.arange(xs.size) * 1e-6)
    return float(1.0 - np.interp(value, xs, ys))


def fraction_above(percentiles: dict, value: float) -> float:
    return float(np.clip(_percentile_cdf(percentiles, value), 0.0, 1.0))


def fraction_below(percentiles: dict, value: float) -> float:
    return float(np.clip(1.0 - _percentile_cdf(percentiles, value), 0.0, 1.0))


PERCENTILES = (5, 10, 25, 50, 75, 90, 95)


def _relative_from_levels(level_db: np.ndarray, octaves: np.ndarray, ref_mask: np.ndarray) -> np.ndarray:
    density = level_db - 10.0 * np.log10(np.maximum(octaves, 1e-3))
    ref = float(np.mean(density[ref_mask])) if np.any(ref_mask) else float(np.mean(density))
    return density - ref


def analyze_spectrum(audio_stereo: np.ndarray, sr: int) -> dict:
    """Single chunked STFT pass. Returns a JSON-serialisable dict."""
    audio_stereo = np.asarray(audio_stereo, dtype=np.float32)
    if audio_stereo.ndim == 1:
        audio_stereo = np.stack([audio_stereo, audio_stereo], axis=1)
    left, right = audio_stereo[:, 0], audio_stereo[:, 1]
    mid = (left + right) * 0.5
    side = (left - right) * 0.5

    n_fft = C.SPECTRAL_N_FFT
    hop = C.SPECTRAL_HOP
    pad = max(0, n_fft - mid.size)
    if pad:
        mid = np.pad(mid, (0, pad))
        side = np.pad(side, (0, pad))
    window = np.hanning(n_fft).astype(np.float32)
    # Scale so a full-scale sine in one band reads ~-3 dB (power 0.5).
    scale = 2.0 / float(np.sum(window)) ** 2
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr).astype(np.float32)

    bands = hires_bands(sr)
    hires_ranges = [(b["lo"], b["hi"]) for b in bands]
    agg_hires, bin_counts = _aggregation_matrix(freqs, hires_ranges)
    legacy_ranges = [(lo, min(hi, sr / 2.0)) for lo, hi in LEGACY_BANDS.values()]
    agg_legacy, _ = _aggregation_matrix(freqs, legacy_ranges)
    grid_hz, agg_grid = _resonance_grid(freqs, sr)

    mid_frames = sliding_window_view(mid, n_fft)[::hop]
    side_frames = sliding_window_view(side, n_fft)[::hop]
    n_frames = mid_frames.shape[0]

    mid_band = np.zeros((len(bands), n_frames), dtype=np.float64)
    side_band = np.zeros((len(bands), n_frames), dtype=np.float64)
    legacy_band = np.zeros(len(LEGACY_BANDS), dtype=np.float64)
    grid_frames = np.zeros((grid_hz.size, n_frames), dtype=np.float32)
    frame_power = np.zeros(n_frames, dtype=np.float64)
    centroid_num = np.zeros(n_frames, dtype=np.float64)
    long_term_power = np.zeros(freqs.size, dtype=np.float64)

    for start in range(0, n_frames, C.SPECTRAL_CHUNK_FRAMES):
        stop = min(n_frames, start + C.SPECTRAL_CHUNK_FRAMES)
        m_spec = np.fft.rfft(mid_frames[start:stop] * window, axis=1)
        s_spec = np.fft.rfft(side_frames[start:stop] * window, axis=1)
        m_pow = (m_spec.real**2 + m_spec.imag**2).astype(np.float32) * scale
        s_pow = (s_spec.real**2 + s_spec.imag**2).astype(np.float32) * scale
        mid_band[:, start:stop] = agg_hires @ m_pow.T
        side_band[:, start:stop] = agg_hires @ s_pow.T
        legacy_band += (agg_legacy @ m_pow.T).sum(axis=1)
        grid_frames[:, start:stop] = agg_grid @ m_pow.T
        frame_power[start:stop] = m_pow.sum(axis=1)
        centroid_num[start:stop] = m_pow @ freqs
        long_term_power += m_pow.sum(axis=0)

    frame_db = 10.0 * np.log10(frame_power + EPS)
    keep = frame_db >= (float(frame_db.max()) + C.SPECTRAL_GATE_REL_DB) if n_frames else np.zeros(0, dtype=bool)
    if not np.any(keep):
        keep = np.ones(n_frames, dtype=bool)

    centers = np.array([b["center"] for b in bands])
    # Per-octave normalisation uses the span the band's FFT bins ACTUALLY
    # cover, not its nominal edges: at ~5.4 Hz resolution a 70-90 Hz band
    # holds 3 bins (16 Hz), and dividing by the nominal 20 Hz would read
    # ~1 dB low on pink noise.
    df = float(freqs[1] - freqs[0])
    octaves = np.empty(len(bands))
    for i, b in enumerate(bands):
        idx = np.where(agg_hires[i] > 0)[0]
        if idx.size:
            lo_eff = max(float(freqs[idx[0]]) - df / 2.0, df / 2.0)
            octaves[i] = np.log2((float(freqs[idx[-1]]) + df / 2.0) / lo_eff)
        else:
            octaves[i] = np.log2(b["hi"] / b["lo"])
    ref_mask = (centers >= C.RELATIVE_REF_LOW_HZ) & (centers <= C.RELATIVE_REF_HIGH_HZ)

    mean_mid = mid_band[:, keep].mean(axis=1)
    mean_side = side_band[:, keep].mean(axis=1)
    level_db = 10.0 * np.log10(mean_mid + EPS)
    side_level_db = 10.0 * np.log10(mean_side + EPS)
    relative_db = _relative_from_levels(level_db, octaves, ref_mask)

    # --- temporal persistence: per-segment relative spectra -------------
    seg_len = C.PERSISTENCE_SEGMENT_FRAMES
    if n_frames < seg_len * 6:
        seg_len = max(1, n_frames // 6)
    seg_rel = []
    seg_grid = []
    for s0 in range(0, n_frames - seg_len + 1, seg_len):
        seg_keep = keep[s0 : s0 + seg_len]
        if seg_keep.sum() < max(1, seg_len // 2):
            continue
        seg_power = mid_band[:, s0 : s0 + seg_len][:, seg_keep].mean(axis=1)
        seg_rel.append(_relative_from_levels(10.0 * np.log10(seg_power + EPS), octaves, ref_mask))
        seg_grid.append(grid_frames[:, s0 : s0 + seg_len][:, seg_keep].mean(axis=1))
    seg_rel_arr = np.array(seg_rel) if seg_rel else relative_db[np.newaxis, :]
    seg_percentiles = {
        b["name"]: {str(p): round(float(v), 3) for p, v in zip(PERCENTILES, np.percentile(seg_rel_arr[:, i], PERCENTILES))}
        for i, b in enumerate(bands)
    }

    # --- stereo per band / region ---------------------------------------
    width_per_band = np.sqrt(mean_side / (mean_mid + EPS))
    stereo_regions = {}
    for name, (lo, hi) in C.STEREO_REGIONS_HZ.items():
        sel = (centers >= lo) & (centers < min(hi, sr / 2.0))
        if not np.any(sel):
            continue
        m_e = float(mean_mid[sel].sum())
        s_e = float(mean_side[sel].sum())
        stereo_regions[name] = {
            "width": round(float(np.sqrt(s_e / (m_e + EPS))), 4),
            # With L=M+S, R=M-S and equal-power channels:
            # corr = (|M|^2 - |S|^2) / (|M|^2 + |S|^2)
            "correlation": round(float((m_e - s_e) / (m_e + s_e + EPS)), 4),
        }

    # --- summary descriptors --------------------------------------------
    legacy_total = float(legacy_band.sum())
    legacy_shares = {k: (float(v / legacy_total) if legacy_total > EPS else 0.0) for k, v in zip(LEGACY_BANDS, legacy_band)}

    active_power = frame_power[keep]
    centroid = float(np.sum(centroid_num[keep]) / (np.sum(active_power) + EPS))
    cumulative = np.cumsum(long_term_power)
    rolloff_85 = float(freqs[int(np.searchsorted(cumulative, 0.85 * cumulative[-1]))]) if cumulative[-1] > 0 else 0.0

    fit_sel = (centers >= 50.0) & (centers <= 16000.0) & (level_db > -110.0)
    tilt = float(np.polyfit(np.log2(centers[fit_sel]), relative_db[fit_sel], 1)[0]) if fit_sel.sum() >= 3 else 0.0

    # --- lossy codec cutoff ----------------------------------------------
    codec_cutoff_hz = None
    for i in range(len(bands) - 1, 0, -1):
        if bands[i]["lo"] < 11000.0:
            break
        if relative_db[i - 1] - relative_db[i] > C.CODEC_CUTOFF_CLIFF_DB:
            codec_cutoff_hz = float(bands[i]["lo"])

    # --- resonances ------------------------------------------------------
    resonances = _find_resonances(grid_hz, np.array(seg_grid) if seg_grid else grid_frames[:, keep].mean(axis=1)[np.newaxis, :])

    return {
        "bands": [
            {"name": b["name"], "lo_hz": round(b["lo"], 1), "hi_hz": round(b["hi"], 1), "center_hz": round(b["center"], 1), "fft_bins": int(c)}
            for b, c in zip(bands, bin_counts)
        ],
        "level_db": {b["name"]: round(float(v), 3) for b, v in zip(bands, level_db)},
        "side_level_db": {b["name"]: round(float(v), 3) for b, v in zip(bands, side_level_db)},
        "relative_db": {b["name"]: round(float(v), 3) for b, v in zip(bands, relative_db)},
        "segment_percentiles": seg_percentiles,
        "segment_count": int(seg_rel_arr.shape[0]),
        "width_per_band": {b["name"]: round(float(v), 4) for b, v in zip(bands, width_per_band)},
        "stereo_regions": stereo_regions,
        "legacy_shares": legacy_shares,
        "spectral_centroid_hz": round(centroid, 1),
        "spectral_rolloff_85_hz": round(rolloff_85, 1),
        "spectral_tilt_db_per_octave": round(tilt, 3),
        "codec_cutoff_hz": codec_cutoff_hz,
        "resonances": resonances,
    }


def _find_resonances(grid_hz: np.ndarray, seg_grid_power: np.ndarray) -> list[dict]:
    """Narrow peaks that stand above their own 1-octave neighbourhood in
    most segments. Tonal music puts peaks at note frequencies too, so these
    are only ever used as DYNAMIC-EQ centre candidates (reduction engages
    only when the peak flares up), never as static cuts on their own."""
    if seg_grid_power.ndim != 2 or seg_grid_power.shape[1] < 13:
        return []
    db = 10.0 * np.log10(seg_grid_power + EPS)
    kernel = np.ones(13) / 13.0  # 13 x 1/12 octave = 1 octave
    padded = np.pad(db, ((0, 0), (6, 6)), mode="edge")
    smooth = np.apply_along_axis(lambda r: np.convolve(r, kernel, mode="valid"), 1, padded)
    residual = db - smooth
    mean_res = residual.mean(axis=0)
    persistence = (residual > C.RESONANCE_MIN_PROMINENCE_DB * 0.5).mean(axis=0)
    found = []
    for i in range(1, grid_hz.size - 1):
        if mean_res[i] < C.RESONANCE_MIN_PROMINENCE_DB or persistence[i] < C.RESONANCE_MIN_PERSISTENCE:
            continue
        if mean_res[i] >= mean_res[i - 1] and mean_res[i] >= mean_res[i + 1]:
            found.append({"center_hz": round(float(grid_hz[i]), 1), "prominence_db": round(float(mean_res[i]), 2), "persistence": round(float(persistence[i]), 3)})
    found.sort(key=lambda r: r["prominence_db"] * r["persistence"], reverse=True)
    return found[: C.RESONANCE_MAX_REPORTED]


def _band_env_db(signal: np.ndarray, sr: int, lo: float, hi: float, frame: int) -> np.ndarray:
    hi = min(hi, sr * 0.49)
    if hi <= lo * 1.05:
        return np.full(signal.size // frame, -120.0)
    sos = butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    filtered = sosfilt(sos, signal)
    n = filtered.size // frame
    frames = filtered[: n * frame].reshape(n, frame)
    return 10.0 * np.log10(np.mean(frames * frames, axis=1) + EPS)


def sibilance_evidence(audio_stereo: np.ndarray, sr: int) -> dict:
    """Narrow-band, temporal sibilance evidence on the mid channel.

    Sibilance = short, centred bursts in ~5-9 kHz that jump relative to the
    vocal presence region AND relative to the >11 kHz region (a cymbal
    crash or open hat raises both, so it is discounted). Broad, steady HF
    energy is brightness, not sibilance, and scores ~0 here."""
    empty = {"score": 0.0, "center_hz": 6500.0, "jump_db": 0.0, "event_fraction": 0.0, "centred_ratio": 1.0}
    audio_stereo = np.asarray(audio_stereo, dtype=np.float32)
    if audio_stereo.shape[0] < sr or sr < 24000:
        return empty
    mid = ((audio_stereo[:, 0] + audio_stereo[:, 1]) * 0.5).astype(np.float64)
    side = ((audio_stereo[:, 0] - audio_stereo[:, 1]) * 0.5).astype(np.float64)
    frame = max(1, int(sr * C.SIBILANCE_FRAME_S))

    pres = _band_env_db(mid, sr, *C.SIBILANCE_PRESENCE_BAND_HZ, frame)
    air = _band_env_db(mid, sr, *C.SIBILANCE_AIR_BAND_HZ, frame)
    active = pres > (float(pres.max()) - 45.0)
    if active.sum() < 20:
        return empty

    best = None
    for lo, hi in C.SIBILANCE_CANDIDATE_BANDS_HZ:
        if hi > sr * 0.49:
            continue
        cand = _band_env_db(mid, sr, lo, hi, frame)
        d_pres = (cand - pres)[active]
        d_air = (cand - air)[active]
        threshold = np.percentile(d_pres, C.SIBILANCE_EVENT_PERCENTILE)
        events = d_pres >= threshold
        jump_pres = float(np.mean(d_pres[events]) - np.median(d_pres))
        jump_air = float(np.mean(d_air[events]) - np.median(d_air))
        specific_jump = min(jump_pres, jump_air)
        event_fraction = float(np.mean(d_pres > np.median(d_pres) + 6.0))
        if best is None or specific_jump > best["jump_db"]:
            best = {"lo": lo, "hi": hi, "jump_db": specific_jump, "event_fraction": event_fraction, "events_idx": np.where(active)[0][events]}

    if best is None:
        return empty
    side_env = _band_env_db(side, sr, best["lo"], best["hi"], frame)
    mid_env = _band_env_db(mid, sr, best["lo"], best["hi"], frame)
    idx = best["events_idx"]
    centred_ratio = float(np.sqrt(np.mean(10 ** (side_env[idx] / 10.0)) / (np.mean(10 ** (mid_env[idx] / 10.0)) + EPS)))

    jump_term = float(np.clip((best["jump_db"] - 5.0) / 8.0, 0.0, 1.0))
    centred_term = float(np.clip(1.2 - centred_ratio * 2.0, 0.3, 1.0))
    # Sibilance is intermittent: continuous events (>25% of frames) are a
    # hi-hat pattern or broad brightness, not sibilance.
    sparsity_term = float(np.clip(1.0 - (best["event_fraction"] - 0.12) / 0.2, 0.0, 1.0))
    return {
        "score": round(jump_term * centred_term * sparsity_term, 4),
        "center_hz": round(float(np.sqrt(best["lo"] * best["hi"])), 1),
        "jump_db": round(best["jump_db"], 2),
        "event_fraction": round(best["event_fraction"], 4),
        "centred_ratio": round(centred_ratio, 3),
    }
