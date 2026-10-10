"""Measured decisions for the (opt-in) vocal/accompaniment stem path.

The rest of the engine is "measure -> detect a problem -> justified, bounded
correction"; the stem path used to be "it's a chorus -> +0.30 dB vocal and a
fixed reverb send". This module makes it follow the same philosophy:

    vocal-to-accompaniment relationship (per section, in the presence band
    where intelligibility lives) -> vocal level spread -> vocal low-mid /
    harshness / sibilance -> decide whether anything should change.

Every decision defaults to "no change"; a move happens only when a
measurement says the vocal does not sit correctly, and its size is a
fraction of the measured gap, capped. Nothing is added that the source
didn't ask for (no artificial reverb: ambience is a mix decision, not a
mastering correction).
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfiltfilt

EPS = 1e-12

# Block size for level statistics: long enough to average over a sung
# syllable or two, short enough to follow sections.
BLOCK_S = 0.4
# A block counts as "vocal active" when the vocal stem is within this many
# dB of its own loudest blocks (rest = gaps / bleed / silence).
VOCAL_ACTIVE_REL_DB = -30.0
# Presence band: where vocal intelligibility and masking by the arrangement
# are decided.
PRESENCE_BAND_HZ = (1000.0, 4000.0)

# Section balance: a section whose vocal-to-accompaniment ratio (presence
# band) falls this far below the song's own typical ratio is "buried".
SECTION_VAR_TOLERANCE_DB = 1.5
SECTION_GAIN_FRACTION = 0.5     # correct half the measured deficit beyond tolerance...
SECTION_MAX_GAIN_DB = 1.0       # ...and never more than this
SECTION_MIN_ACTIVE_BLOCKS = 6   # ~2.4 s of singing before a section is judged

# Whole-song masking: vocal presence-band level this far below the
# accompaniment's means the arrangement masks the vocal everywhere.
GLOBAL_MASKING_VAR_DB = -6.0
GLOBAL_SPACE_CUT_PER_DB = 0.25
GLOBAL_SPACE_CUT_MAX_DB = 1.2

# Vocal dynamics: spread (p90 - p10) of active-block levels above which the
# vocal needs levelling at all.
VOCAL_SPREAD_COMPRESS_DB = 9.0
VOCAL_MAX_RATIO = 2.5

# Vocal tone: band-power ratios (dB) of the vocal stem itself.
VOCAL_LOW_MID_EXCESS_DB = 3.0     # 250-500 Hz vs 500-2000 Hz beyond which it is boxy
VOCAL_LOW_MID_MAX_CUT_DB = 1.5
VOCAL_HARSH_EXCESS_DB = 2.0       # 2.5-5 kHz vs 1-2.5 kHz beyond which it is harsh
VOCAL_HARSH_MAX_CUT_DB = 1.5
VOCAL_SIBILANCE_EXCESS_DB = -6.0  # 5-9 kHz vs 1-4 kHz above which it is sibilant
VOCAL_DEESS_MAX_DB = 4.0
# Smaller moves are inaudible and dropped (same rule as the full-mix
# planner's EQ_MIN_NODE_GAIN_DB, slightly higher for a separated stem).
MIN_MOVE_DB = 0.25


def _mono(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    return x if x.ndim == 1 else x.mean(axis=1)


def _band(x: np.ndarray, sr: int, lo: float, hi: float) -> np.ndarray:
    sos = butter(4, [lo, min(hi, sr / 2.0 - 100.0)], btype="band", fs=sr, output="sos")
    return sosfiltfilt(sos, x).astype(np.float32)


def _block_db(x: np.ndarray, sr: int) -> np.ndarray:
    n = max(1, int(sr * BLOCK_S))
    k = x.shape[0] // n
    if k < 1:
        return np.array([20.0 * np.log10(float(np.sqrt(np.mean(x**2))) + EPS)])
    return 20.0 * np.log10(np.sqrt(np.mean(x[: k * n].reshape(k, n) ** 2, axis=1)) + EPS)


def _band_ratio_db(x: np.ndarray, sr: int, num: tuple, den: tuple) -> float:
    a = float(np.mean(_band(x, sr, *num) ** 2))
    b = float(np.mean(_band(x, sr, *den) ** 2))
    return float(10.0 * np.log10((a + EPS) / (b + EPS)))


def _section_masks(n_blocks: int, section_info: dict) -> dict[str, np.ndarray]:
    t = (np.arange(n_blocks) + 0.5) * BLOCK_S
    masks = {}

    def mask_for(regions):
        m = np.zeros(n_blocks, dtype=bool)
        for s, e in regions:
            m |= (t >= float(s)) & (t < float(e))
        return m

    final = section_info.get("final_chorus_region")
    choruses = [r for r in section_info.get("chorus_regions", []) if not final or tuple(r) != tuple(final)]
    masks["chorus"] = mask_for(choruses)
    masks["final_chorus"] = mask_for([final]) if final else np.zeros(n_blocks, dtype=bool)
    bridge = section_info.get("bridge_region")
    masks["bridge"] = mask_for([bridge]) if bridge else np.zeros(n_blocks, dtype=bool)
    return masks


def measure_vocal_relationship(vocals: np.ndarray, accompaniment: np.ndarray, sr: int, section_info: dict) -> dict:
    v, a = _mono(vocals), _mono(accompaniment)
    n = min(v.size, a.size)
    v, a = v[:n], a[:n]
    v_pres, a_pres = _band(v, sr, *PRESENCE_BAND_HZ), _band(a, sr, *PRESENCE_BAND_HZ)
    v_db, a_db = _block_db(v, sr), _block_db(a, sr)
    vp_db, ap_db = _block_db(v_pres, sr), _block_db(a_pres, sr)
    active = v_db >= float(np.max(v_db)) + VOCAL_ACTIVE_REL_DB
    var_db = vp_db - ap_db

    out = {
        "active_vocal_share": round(float(np.mean(active)), 3),
        "vocal_to_accompaniment_presence_db": round(float(np.median(var_db[active])), 2) if np.any(active) else None,
        "vocal_level_spread_db": round(float(np.percentile(v_db[active], 90) - np.percentile(v_db[active], 10)), 2) if np.count_nonzero(active) >= 4 else 0.0,
        "vocal_low_mid_ratio_db": round(_band_ratio_db(v, sr, (250.0, 500.0), (500.0, 2000.0)), 2),
        "vocal_harshness_ratio_db": round(_band_ratio_db(v, sr, (2500.0, 5000.0), (1000.0, 2500.0)), 2),
        "vocal_sibilance_ratio_db": round(_band_ratio_db(v, sr, (5000.0, 9000.0), (1000.0, 4000.0)), 2),
        "sections": {},
        "sections_reliable": section_info.get("method") == "energy_profile",
    }
    if np.any(active):
        for name, m in _section_masks(var_db.size, section_info).items():
            sel = m & active
            if np.count_nonzero(sel) >= SECTION_MIN_ACTIVE_BLOCKS:
                out["sections"][name] = {"vocal_to_accompaniment_presence_db": round(float(np.median(var_db[sel])), 2), "active_blocks": int(np.count_nonzero(sel))}
    return out


def plan_stem_moves(measurements: dict, params: dict) -> dict:
    """Turn measurements into stem moves. Every value is 0 / disabled unless
    a measurement justifies it; each carries its reason."""
    reasons: list[str] = []
    song_var = measurements.get("vocal_to_accompaniment_presence_db")

    # --- section vocal balance -------------------------------------------
    section_gains = {"chorus": 0.0, "bridge": 0.0, "final_chorus": 0.0}
    if song_var is None:
        reasons.append("no sustained vocal detected: no section vocal moves")
    elif not measurements.get("sections_reliable"):
        # The section detector's structural fallback guesses where a chorus
        # might be; never ride a vocal on a guess.
        reasons.append("song sections not reliably detected: no section vocal moves")
    else:
        for name, sec in measurements.get("sections", {}).items():
            deficit = song_var - sec["vocal_to_accompaniment_presence_db"]
            if deficit > SECTION_VAR_TOLERANCE_DB:
                gain = round(min(SECTION_MAX_GAIN_DB, SECTION_GAIN_FRACTION * deficit), 2)
                section_gains[name] = gain
                reasons.append(f"{name}: vocal {deficit:.1f} dB further under the arrangement than the song's typical balance -> +{gain:.2f} dB")
        if not any(section_gains.values()):
            reasons.append("vocal sits consistently across sections: no section vocal moves")

    # --- arrangement space for the vocal ------------------------------------
    space_cut = 0.0
    if song_var is not None and song_var < GLOBAL_MASKING_VAR_DB:
        space_cut = -min(GLOBAL_SPACE_CUT_MAX_DB, (GLOBAL_MASKING_VAR_DB - song_var) * GLOBAL_SPACE_CUT_PER_DB)
        reasons.append(f"vocal {song_var:.1f} dB under the arrangement in 1-4 kHz: accompaniment presence cut {space_cut:.2f} dB")
    presence_req = float(params.get("vocal_presence_gain_db", 0.0))
    if presence_req > 0.0:
        space_cut -= min(0.5, presence_req * 0.25)
        reasons.append(f"presence requested (+{presence_req:.2f} dB): extra accompaniment presence cut")
    space_cut = round(max(space_cut, -GLOBAL_SPACE_CUT_MAX_DB), 2)

    # --- vocal chain ----------------------------------------------------------
    spread = float(measurements.get("vocal_level_spread_db", 0.0))
    ratio = 1.0
    if spread > VOCAL_SPREAD_COMPRESS_DB:
        ratio = round(1.0 + min(1.0, (spread - VOCAL_SPREAD_COMPRESS_DB) / VOCAL_SPREAD_COMPRESS_DB) * (VOCAL_MAX_RATIO - 1.0), 2)
        reasons.append(f"vocal level spread {spread:.1f} dB: levelling ratio {ratio:.2f}")

    low_mid = float(measurements.get("vocal_low_mid_ratio_db", 0.0))
    low_mid_cut = -round(min(VOCAL_LOW_MID_MAX_CUT_DB, 0.5 * (low_mid - VOCAL_LOW_MID_EXCESS_DB)), 2) if low_mid > VOCAL_LOW_MID_EXCESS_DB else 0.0
    if low_mid_cut:
        reasons.append(f"vocal 250-500 Hz {low_mid:.1f} dB over 500-2000 Hz: {low_mid_cut:.2f} dB at 320 Hz")

    harsh = float(measurements.get("vocal_harshness_ratio_db", -99.0))
    harsh_cut = -round(min(VOCAL_HARSH_MAX_CUT_DB, 0.5 * (harsh - VOCAL_HARSH_EXCESS_DB)), 2) if harsh > VOCAL_HARSH_EXCESS_DB else 0.0
    if harsh_cut:
        reasons.append(f"vocal 2.5-5 kHz {harsh:.1f} dB over 1-2.5 kHz: {harsh_cut:.2f} dB at 3.6 kHz")

    sib = float(measurements.get("vocal_sibilance_ratio_db", -99.0))
    deess = 0.0
    if sib > VOCAL_SIBILANCE_EXCESS_DB:
        deess = -round(min(VOCAL_DEESS_MAX_DB, 0.5 * (sib - VOCAL_SIBILANCE_EXCESS_DB) + 0.5), 2)
        reasons.append(f"vocal 5-9 kHz only {abs(sib):.1f} dB under 1-4 kHz: sibilance shelf {deess:.2f} dB")
    plan_deess = -2.0 * float(params.get("deesser_strength", 0.0) or 0.0)
    if plan_deess < deess - 0.05:
        # The full-mix plan measured sibilance too: honour the stronger.
        deess = round(max(plan_deess, -VOCAL_DEESS_MAX_DB), 2)
        reasons.append(f"full-mix plan measured sibilance: shelf {deess:.2f} dB")

    def gate(value: float, label: str) -> float:
        if value and abs(value) < MIN_MOVE_DB:
            reasons.append(f"{label} {value:+.2f} dB below the {MIN_MOVE_DB} dB audibility floor: dropped")
            return 0.0
        return value

    low_mid_cut = gate(low_mid_cut, "vocal low-mid cut")
    harsh_cut = gate(harsh_cut, "vocal harshness cut")
    deess = gate(deess, "vocal sibilance shelf")
    space_cut = gate(space_cut, "accompaniment presence cut")
    section_gains = {k: gate(v, f"{k} vocal ride") for k, v in section_gains.items()}

    presence = float(np.clip(presence_req, -0.8, 1.1))
    air = round(0.15 * presence, 2) if presence > 0 and harsh_cut == 0.0 and deess == 0.0 else 0.0
    if not any([any(section_gains.values()), space_cut, ratio > 1.0, low_mid_cut, harsh_cut, deess, presence, air]):
        reasons.append("vocal already sits correctly: stems recombined unchanged")
    return {
        "section_vocal_gain_db": section_gains,
        "accompaniment_presence_cut_db": space_cut,
        "vocal_compression_ratio": ratio,
        "vocal_low_mid_cut_db": low_mid_cut,
        "vocal_harsh_cut_db": harsh_cut,
        "vocal_deess_shelf_db": deess,
        "vocal_presence_gain_db": round(presence, 2),
        "vocal_air_gain_db": air,
        "reasons": reasons,
    }
