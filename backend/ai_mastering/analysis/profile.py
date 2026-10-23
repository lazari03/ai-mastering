"""SourceProfile: every measurement the planner is allowed to base a decision
on, in one explicit, JSON-serialisable structure.

Every field is derived from a real measurement of the audio (see
audio_utils._analysis_from_audio and analysis/spectral.py). The derived
0..1 "scores" are deterministic functions of those measurements against
the GENRE-INDEPENDENT neutral curve, documented where they are computed.
Genre-dependent judgement happens later, in diagnostics/problems.py.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields

import numpy as np

from ..planning.target_model import neutral_curve_for_bands


def _region_mean(values: dict[str, float], bands: list[dict], lo: float, hi: float) -> float:
    sel = [values[b["name"]] for b in bands if lo <= b["center_hz"] < hi and b["name"] in values]
    return float(np.mean(sel)) if sel else 0.0


def _score(excess_db: float, dead_db: float = 2.0, full_db: float = 6.0) -> float:
    """0 inside a dead zone, rising linearly to 1 at full_db beyond it."""
    return float(np.clip((excess_db - dead_db) / full_db, 0.0, 1.0))


@dataclass
class SourceProfile:
    sample_rate: int
    duration_s: float

    integrated_lufs: float
    true_peak_db: float
    sample_peak_db: float
    rms_db: float
    crest_db: float
    short_term_crest_db: float
    plr_db: float
    lra_lu: float
    peak_p995_db: float

    spectral_bands: dict            # relative per-octave spectrum (dB), hi-res
    band_levels_db: dict            # absolute band level (dB), hi-res
    band_layout: list               # [{name, lo_hz, hi_hz, center_hz, fft_bins}]
    segment_percentiles: dict       # per band: persistence statistics
    segment_count: int
    spectral_tilt: float
    spectral_centroid: float
    spectral_rolloff_85: float
    codec_cutoff_hz: float | None
    resonances: list

    transient_strength: float
    transient_density: float
    transient_contrast: float
    low_end_impact: float
    drum_punch_estimate: float

    stereo_width: float
    stereo_correlation: float
    width_per_band: dict
    stereo_regions: dict
    low_end_stereo_width: float
    low_end_correlation: float
    mid_stereo_width: float
    high_stereo_width: float
    near_mono: bool

    tempo_bpm: float
    bpm_confidence: float
    clipping: dict
    sibilance: dict

    mud_score: float = 0.0
    boom_score: float = 0.0
    thinness_score: float = 0.0
    harshness_score: float = 0.0
    sibilance_score: float = 0.0
    brightness_score: float = 0.0
    dullness_score: float = 0.0
    transient_health: float = 0.0
    dynamic_health_score: float = 0.0
    already_limited_score: float = 0.0
    score_basis: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "SourceProfile":
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in names})


def build_source_profile(analysis: dict, spectral: dict, sibilance: dict, peak_p995_db: float, clipping: dict, bpm_conf: float, sr: int, duration_s: float) -> SourceProfile:
    bands = spectral["bands"]
    rel = spectral["relative_db"]
    regions = spectral["stereo_regions"]

    profile = SourceProfile(
        sample_rate=int(sr),
        duration_s=round(float(duration_s), 3),
        integrated_lufs=float(analysis["integrated_lufs"]),
        true_peak_db=float(analysis["true_peak_db"]),
        sample_peak_db=float(analysis["peak_level_db"]),
        rms_db=float(analysis["rms_db"]),
        crest_db=float(analysis["crest_factor_db"]),
        short_term_crest_db=float(analysis.get("short_term_crest_db", 0.0)),
        plr_db=float(analysis["plr_db"]),
        lra_lu=float(analysis["loudness_range_lu"]),
        peak_p995_db=round(float(peak_p995_db), 3),
        spectral_bands=dict(rel),
        band_levels_db=dict(spectral["level_db"]),
        band_layout=list(bands),
        segment_percentiles=dict(spectral["segment_percentiles"]),
        segment_count=int(spectral["segment_count"]),
        spectral_tilt=float(spectral["spectral_tilt_db_per_octave"]),
        spectral_centroid=float(spectral["spectral_centroid_hz"]),
        spectral_rolloff_85=float(spectral["spectral_rolloff_85_hz"]),
        codec_cutoff_hz=spectral.get("codec_cutoff_hz"),
        resonances=list(spectral.get("resonances", [])),
        transient_strength=float(analysis.get("transient_strength", 0.0)),
        transient_density=float(analysis.get("transient_density", 0.0)),
        transient_contrast=float(analysis.get("transient_contrast", 0.0)),
        low_end_impact=float(analysis.get("low_end_impact", 0.0)),
        drum_punch_estimate=float(analysis.get("drum_punch_estimate", 0.0)),
        stereo_width=float(analysis["stereo_width_estimate"]),
        stereo_correlation=float(analysis["stereo_correlation"]),
        width_per_band=dict(spectral["width_per_band"]),
        stereo_regions=dict(regions),
        low_end_stereo_width=float(regions.get("low_20_120hz", {}).get("width", 0.0)),
        low_end_correlation=float(regions.get("low_20_120hz", {}).get("correlation", 1.0)),
        mid_stereo_width=float(regions.get("mid_500_2000hz", {}).get("width", 0.0)),
        high_stereo_width=float(regions.get("high_6000hz_up", {}).get("width", 0.0)),
        near_mono=bool(analysis.get("near_mono_source", False)),
        tempo_bpm=float(analysis.get("tempo_bpm", 0.0)),
        bpm_confidence=round(float(bpm_conf), 3),
        clipping=dict(clipping),
        sibilance=dict(sibilance),
    )
    _derive_scores(profile)
    return profile


def _derive_scores(p: SourceProfile) -> None:
    """Genre-independent descriptive scores (0..1). Deviation = measured
    relative spectrum minus the neutral curve, averaged over the named
    region. 2 dB is ignored (normal mix variation); 8 dB beyond neutral
    scores 1.0."""
    bands = p.band_layout
    neutral = neutral_curve_for_bands(bands)
    dev = {k: p.spectral_bands[k] - neutral[k] for k in p.spectral_bands}

    boom = _region_mean(dev, bands, 90.0, 220.0)
    mud = _region_mean(dev, bands, 220.0, 550.0)
    body = _region_mean(dev, bands, 55.0, 300.0)
    harsh = _region_mean(dev, bands, 2000.0, 7500.0)
    bright = _region_mean(dev, bands, 7500.0, 14000.0)
    air = _region_mean(dev, bands, 14000.0, 20001.0)

    p.boom_score = round(_score(boom), 3)
    p.mud_score = round(_score(mud), 3)
    p.thinness_score = round(_score(-body), 3)
    p.harshness_score = round(_score(harsh), 3)
    p.brightness_score = round(_score(max(bright, 0.5 * (bright + air))), 3)
    p.dullness_score = round(_score(-(0.5 * bright + 0.5 * harsh)), 3)
    p.sibilance_score = round(float(p.sibilance.get("score", 0.0)), 3)

    # Transient health: intact, strong attacks AND a healthy short-term
    # crest (16 dB short-term crest saturates it; heavily limited masters
    # sit below ~10 dB). Same formula the legacy transient budget uses.
    p.transient_health = round(float(np.clip(p.transient_strength * 0.5 + min(p.short_term_crest_db / 16.0, 1.0) * 0.5, 0.0, 1.0)), 3)

    # Dynamic health: PLR >= 12 dB and short-term crest >= 12 dB are fully
    # healthy; PLR <= 6 / crest <= 6 are brickwalled.
    plr_term = float(np.clip((p.plr_db - 6.0) / 6.0, 0.0, 1.0))
    stc_term = float(np.clip((p.short_term_crest_db - 6.0) / 6.0, 0.0, 1.0))
    p.dynamic_health_score = round(0.4 * plr_term + 0.4 * stc_term + 0.2 * p.transient_strength, 3)

    # Already-limited: low PLR, low short-term crest, peaks parked just
    # under full scale. Each term is a continuous ramp, not a gate.
    lim_plr = float(np.clip((10.0 - p.plr_db) / 4.0, 0.0, 1.0))
    lim_stc = float(np.clip((10.0 - p.short_term_crest_db) / 4.0, 0.0, 1.0))
    lim_tp = float(np.clip((p.true_peak_db + 2.0) / 1.5, 0.0, 1.0))
    p.already_limited_score = round(0.5 * lim_plr + 0.3 * lim_stc + 0.2 * lim_tp * lim_plr, 3)

    p.score_basis = {
        "reference": "neutral curve (genre independent)",
        "region_deviation_db": {
            "boom_90_220": round(boom, 2),
            "mud_220_550": round(mud, 2),
            "body_55_300": round(body, 2),
            "harsh_2k_7k5": round(harsh, 2),
            "bright_7k5_14k": round(bright, 2),
            "air_14k_up": round(air, 2),
        },
    }
