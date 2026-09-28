"""Target / context model: what the selected genre, style, category,
flavour, tags and (optional) reference say about the ACCEPTABLE
destination — a tonal window, a loudness range, dynamics expectations and
preservation priorities.

Nothing here prescribes a DSP move. The problem detector compares the
measured SourceProfile against this context; only a measured, persistent,
sufficiently confident deviation outside the window becomes a problem, and
only a problem can become processing.

How the genre enters the tonal target
-------------------------------------
params.GENRE_TARGET_PROFILES' 7-band shares are hand-authored and, as an
absolute description of a mix, systematically bright (every genre puts
~30-40% of energy above 2 kHz; real mixes are far below that). Using them
as absolute targets is what drove the old engine to boost highs and cut
bass on most material. Here they are used RELATIVE to the cross-genre
mean: hip-hop's larger sub share becomes "a little more sub than average
is acceptable", while the shared bias cancels out. That relative offset
(scaled, clipped to +/-2 dB) is added to a neutral full-mix curve.
"""

from __future__ import annotations

import copy
from dataclasses import asdict, dataclass, field

import numpy as np

from params import (
    DELIVERY_TARGETS,
    LOUD_MASTER_TRUE_PEAK_CEILING_DBTP,
    STREAMING_REFERENCE_LUFS,
    TRUE_PEAK_CEILING_DBTP,
    ADJUSTMENT_TAG_BIASES,
    GENRE_TARGET_PROFILES,
    MASTERING_CATEGORY_PROFILES,
    MASTERING_FLAVOURS,
    MASTERING_STYLE_PROFILES,
    SPECTRAL_BAND_KEYS,
)

from . import config as C
from .preset_intent import compile_intent

_LEGACY_BAND_RANGES = {
    "sub_bass_20_60hz": (20.0, 60.0),
    "bass_60_250hz": (60.0, 250.0),
    "low_mid_250_500hz": (250.0, 500.0),
    "mid_500_2000hz": (500.0, 2000.0),
    "high_mid_2000_4000hz": (2000.0, 4000.0),
    "presence_4000_6000hz": (4000.0, 6000.0),
    "brilliance_6000_20000hz": (6000.0, 20000.0),
}


def neutral_curve_db(center_hz: float) -> float:
    xs = np.log2([f for f, _ in C.NEUTRAL_CURVE_ANCHORS_DB])
    ys = np.array([v for _, v in C.NEUTRAL_CURVE_ANCHORS_DB])
    return float(np.interp(np.log2(max(center_hz, 1.0)), xs, ys))


def neutral_curve_for_bands(bands: list[dict]) -> dict[str, float]:
    """Neutral curve sampled at the band centres, re-normalised over the
    same 300-3000 Hz reference region the measured relative spectrum uses."""
    raw = {b["name"]: neutral_curve_db(b["center_hz"]) for b in bands}
    ref = [raw[b["name"]] for b in bands if C.RELATIVE_REF_LOW_HZ <= b["center_hz"] <= C.RELATIVE_REF_HIGH_HZ]
    offset = float(np.mean(ref)) if ref else 0.0
    return {k: v - offset for k, v in raw.items()}


def tolerance_for(center_hz: float) -> float:
    for upper, tol in C.TONAL_TOLERANCE_DB:
        if center_hz <= upper:
            return float(tol)
    return float(C.TONAL_TOLERANCE_DB[-1][1])


def _legacy_band_for(center_hz: float) -> str:
    for key, (lo, hi) in _LEGACY_BAND_RANGES.items():
        if lo <= center_hz < hi:
            return key
    return "brilliance_6000_20000hz" if center_hz >= 6000.0 else "sub_bass_20_60hz"


def _genre_relative_offsets_db(genre: str) -> dict[str, float]:
    """Per legacy band: how this genre differs from the average genre."""
    mean_share = {
        k: float(np.mean([p["target_spectral_balance"][k] for p in GENRE_TARGET_PROFILES.values()])) for k in SPECTRAL_BAND_KEYS
    }
    shares = GENRE_TARGET_PROFILES[genre]["target_spectral_balance"]
    return {
        k: float(np.clip(10.0 * np.log10(max(shares[k], 1e-4) / max(mean_share[k], 1e-4)) * C.GENRE_CURVE_SCALE, -C.GENRE_CURVE_MAX_OFFSET_DB, C.GENRE_CURVE_MAX_OFFSET_DB))
        for k in SPECTRAL_BAND_KEYS
    }


def _smooth_octave(bands: list[dict], values: dict[str, float]) -> dict[str, float]:
    centers = np.log2([b["center_hz"] for b in bands])
    vals = np.array([values[b["name"]] for b in bands])
    out = {}
    for i, b in enumerate(bands):
        w = np.exp(-0.5 * ((centers - centers[i]) / 0.5) ** 2)  # ~1-octave Gaussian
        out[b["name"]] = float(np.sum(w * vals) / np.sum(w))
    return out


# Intent (tag band biases and category tweak_bias) is expressed as target
# shifts on named frequency regions.
_TWEAK_REGIONS_HZ = {
    "low_end": (20.0, 120.0),
    "warmth": (160.0, 550.0),
    "presence": (2000.0, 5500.0),
    "brightness": (7500.0, 20000.0),
}


@dataclass
class TargetContext:
    genre: str
    style: str
    category: str | None
    flavour: str | None
    tags: list[str]
    tonal_target_db: dict[str, float]
    tolerance_low_db: dict[str, float]    # allowed deviation BELOW target
    tolerance_high_db: dict[str, float]   # allowed deviation ABOVE target
    preferred_lufs: float
    acceptable_min_lufs: float
    acceptable_max_lufs: float
    max_lufs_reduce_db: float
    target_crest_db: float
    max_stereo_width: float
    saturation_allowance: float
    compression_aggression: float
    hf_boost_multiplier: float
    deesser_intent: float
    preservation_priorities: dict = field(default_factory=dict)
    transient_safety: dict = field(default_factory=dict)
    reference_used: bool = False
    intent_notes: list[str] = field(default_factory=list)
    style_profile: dict = field(default_factory=dict)
    # Delivery: where the master is going, and the true-peak ceiling that
    # follows from its loudness (see params.DELIVERY_TARGETS).
    delivery: str = "auto"
    ceiling_dbtp: float = TRUE_PEAK_CEILING_DBTP
    # Limits a preset intent sets on top of the engine's own (None = the
    # engine's default applies).
    preset: str | None = None
    limiter_budget_cap_db: float | None = None
    clipper_max_share_db: float = C.CLIPPER_MAX_SHARE_DB

    def to_dict(self) -> dict:
        d = asdict(self)
        for key in ("tonal_target_db", "tolerance_low_db", "tolerance_high_db"):
            d[key] = {k: round(v, 3) for k, v in d[key].items()}
        return d


def resolve_category_bias(category: str | None, flavour: str | None) -> dict:
    empty = {
        "target_lufs_delta": 0.0,
        "target_dynamic_range_delta": 0.0,
        "max_stereo_width_delta": 0.0,
        "saturation_delta": 0.0,
        "compression_aggression_delta": 0.0,
        "hf_boost_cap_delta": 0.0,
        "max_lufs_raise_delta": 0.0,
        "vocal_presence_delta": 0.0,
        "tweak_bias": {},
    }
    if not category or category not in MASTERING_CATEGORY_PROFILES:
        return empty
    combined = dict(empty)
    combined.update({k: v for k, v in MASTERING_CATEGORY_PROFILES[category].items() if k in empty})
    combined["tweak_bias"] = dict(MASTERING_CATEGORY_PROFILES[category].get("tweak_bias", {}))
    flavour_delta = MASTERING_FLAVOURS.get(category, {}).get(flavour) if flavour else None
    if flavour_delta:
        for key, value in flavour_delta.items():
            if key == "tweak_bias":
                continue
            combined[key] = combined.get(key, 0.0) + float(value)
        for tweak_key, tweak_value in flavour_delta.get("tweak_bias", {}).items():
            combined["tweak_bias"][tweak_key] = combined["tweak_bias"].get(tweak_key, 0.0) + float(tweak_value)
    return combined


def build_target_context(
    bands: list[dict],
    genre: str,
    tags: list[str] | None = None,
    style: str = "modern",
    category: str | None = None,
    flavour: str | None = None,
    reference_relative_db: dict[str, float] | None = None,
    preset_intent: dict | None = None,
    delivery: str | None = None,
) -> TargetContext:
    delivery = delivery or "auto"
    if delivery not in DELIVERY_TARGETS:
        raise ValueError(f"Unknown delivery target: {delivery}")
    if genre not in GENRE_TARGET_PROFILES:
        raise ValueError(f"Unknown genre: {genre}")
    if style not in MASTERING_STYLE_PROFILES:
        raise ValueError(f"Unknown style: {style}")
    if category is not None and category not in MASTERING_CATEGORY_PROFILES:
        raise ValueError(f"Unknown mastering category: {category}")
    tags = list(tags or [])

    profile = copy.deepcopy(GENRE_TARGET_PROFILES[genre])
    style_profile = MASTERING_STYLE_PROFILES[style]
    cat = resolve_category_bias(category, flavour)
    notes: list[str] = []

    # --- tonal target ----------------------------------------------------
    neutral = neutral_curve_for_bands(bands)
    genre_off = _genre_relative_offsets_db(genre)
    target = {b["name"]: neutral[b["name"]] + genre_off[_legacy_band_for(b["center_hz"])] for b in bands}
    target = _smooth_octave(bands, target)  # no step edges at legacy band borders

    reference_used = False
    if reference_relative_db:
        common = [b for b in bands if b["name"] in reference_relative_db]
        if len(common) >= len(bands) - 2:
            ref_smooth = _smooth_octave(common, reference_relative_db)
            for b in common:
                target[b["name"]] += C.REFERENCE_CURVE_WEIGHT * (ref_smooth[b["name"]] - target[b["name"]])
            reference_used = True
            notes.append(f"reference moved the tonal target {int(C.REFERENCE_CURVE_WEIGHT * 100)}% toward its octave-smoothed curve")

    tol_low = {b["name"]: tolerance_for(b["center_hz"]) for b in bands}
    tol_high = dict(tol_low)

    def shift_region(lo: float, hi: float, delta_db: float, why: str) -> None:
        if abs(delta_db) < 1e-6:
            return
        for b in bands:
            if lo <= b["center_hz"] < hi:
                target[b["name"]] += delta_db
                # Intent narrows the window on the requested side only.
                side = tol_low if delta_db > 0 else tol_high
                side[b["name"]] *= C.INTENT_TOLERANCE_NARROWING
        notes.append(f"{why}: target {delta_db:+.2f} dB in {lo:.0f}-{hi:.0f} Hz")

    for tag in tags:
        for band_key, delta in ADJUSTMENT_TAG_BIASES.get(tag, {}).get("band_bias_db", {}).items():
            lo, hi = _LEGACY_BAND_RANGES[band_key]
            shift_region(lo, hi, float(delta), f"tag '{tag}'")
    for tweak_key, value in cat["tweak_bias"].items():
        if tweak_key in _TWEAK_REGIONS_HZ:
            lo, hi = _TWEAK_REGIONS_HZ[tweak_key]
            shift_region(lo, hi, float(value) * C.INTENT_TWEAK_TO_TARGET_DB, f"category '{category}' {tweak_key}")

    # Preset intent: each leaning ("boost 120 Hz by up to 0.5 dB") moves the
    # target around that frequency by its allowance x preset_strength. The
    # engine still acts only where the measured source is off target.
    intent = compile_intent(preset_intent) if preset_intent else None
    if intent:
        for band in intent["eq"]:
            lo, hi = band["hz"] / 1.41, band["hz"] * 1.41
            shift_region(lo, hi, band["db"] * intent["strength"], f"preset '{intent['name']}' {band['hz']:.0f} Hz")

    # --- loudness range --------------------------------------------------
    tag_lufs = sum(float(ADJUSTMENT_TAG_BIASES.get(t, {}).get("target_lufs_delta", 0.0)) for t in tags)
    chip_lufs = tag_lufs + cat["target_lufs_delta"] + float(cat["tweak_bias"].get("loudness", 0.0)) * 1.0
    preset_loud = (intent or {}).get("loudness")
    if preset_loud:
        # A preset's own loudness intent already reflects its style.
        preferred = preset_loud["preferred"] + chip_lufs
        notes.append(f"preset '{intent['name']}' loudness {preset_loud['preferred']:.1f} LUFS")
    else:
        preferred = float(profile["target_lufs"]) + float(style_profile["target_lufs_delta"]) + chip_lufs
    delivery_cfg = DELIVERY_TARGETS[delivery]
    if delivery_cfg["reference_lufs"] is not None:
        # Normalizing platforms turn anything louder than their reference
        # down; quieter genres (classical, jazz, podcast) keep their target.
        preferred = min(preferred, float(delivery_cfg["reference_lufs"]))
        notes.append(f"delivery '{delivery}': at most {delivery_cfg['reference_lufs']:.0f} LUFS so the platform never turns it down")
    preferred += float(delivery_cfg["lufs_delta"])
    preferred = float(np.clip(preferred, -20.0, -6.5))
    priorities = dict(profile.get("preservation_priorities", {}))
    if "punch" in cat["tweak_bias"]:
        priorities["transients"] = float(np.clip(priorities.get("transients", 0.75) + 0.15 * cat["tweak_bias"]["punch"], 0.0, 1.0))
    dynamic_priority = float(priorities.get("dynamic_contrast", 0.7))
    below = C.LOUDNESS_WINDOW_BELOW_LU + C.LOUDNESS_DYNAMIC_PRIORITY_EXTRA_LU * dynamic_priority
    # A style that deliberately restrains loudness (small max_lufs_raise_db,
    # e.g. vintage_analog / acoustic_natural) widens the acceptable range
    # downward rather than hard-capping gain.
    below += float(np.clip(1.5 - float(style_profile.get("max_lufs_raise_db", 2.0)), 0.0, 1.5))

    target_crest = float(profile["target_dynamic_range_db"]) + float(style_profile["target_dynamic_range_delta"]) + cat["target_dynamic_range_delta"]
    compression_aggression = sum(float(ADJUSTMENT_TAG_BIASES.get(t, {}).get("compression_aggression_delta", 0.0)) for t in tags) + cat["compression_aggression_delta"]
    saturation = float(profile["base_saturation"]) + float(style_profile["saturation_delta"]) + cat["saturation_delta"]
    saturation += sum(float(ADJUSTMENT_TAG_BIASES.get(t, {}).get("saturation_delta", 0.0)) for t in tags)
    saturation += 0.05 * float(cat["tweak_bias"].get("warmth", 0.0))
    width = float(profile["max_stereo_width"]) + float(style_profile["max_stereo_width_delta"]) + cat["max_stereo_width_delta"]
    width += sum(float(ADJUSTMENT_TAG_BIASES.get(t, {}).get("max_stereo_width_delta", 0.0)) for t in tags)
    width += 0.08 * float(cat["tweak_bias"].get("width", 0.0))
    hf_mult = float(np.clip(1.0 + (float(style_profile["hf_boost_cap_db"]) - 0.75) * 0.4 + cat["hf_boost_cap_delta"] * 0.4, 0.4, 1.4))
    deesser_intent = float(np.clip(sum(float(ADJUSTMENT_TAG_BIASES.get(t, {}).get("deesser_strength", 0.0)) for t in tags), 0.0, 1.0))

    min_lufs = preferred - below
    max_lufs = preferred + C.LOUDNESS_WINDOW_ABOVE_LU
    if preset_loud and "min" in preset_loud:
        shift = preferred - preset_loud["preferred"]
        min_lufs, max_lufs = preset_loud["min"] + shift, preset_loud["max"] + shift
    if delivery_cfg["reference_lufs"] is not None:
        max_lufs = min(max_lufs, float(delivery_cfg["reference_lufs"]))
    min_lufs = min(min_lufs, preferred - 0.5)
    max_lufs = max(max_lufs, preferred)

    # Spotify: <= -1 dBTP, and -2 dBTP once a master is louder than
    # -14 LUFS (dense masters overshoot more in lossy transcoding).
    ceiling = LOUD_MASTER_TRUE_PEAK_CEILING_DBTP if max_lufs > STREAMING_REFERENCE_LUFS else TRUE_PEAK_CEILING_DBTP

    limiter_cap = clipper_cap = None
    if intent:
        saturation = saturation if intent["saturation_max"] is None else min(saturation, intent["saturation_max"])
        width += intent["width_delta"] * intent["strength"]
        deesser_intent = float(np.clip(deesser_intent + 0.3 * intent["strength"] * min(1.0, intent["hf_dynamic_eq_db"] / 2.0), 0.0, 1.0))
        if intent["bus_max_gr_db"] is not None:
            compression_aggression += float(np.clip((intent["bus_max_gr_db"] - 1.5) / 3.0, -0.5, 0.5))
        limiter_cap = intent["limiter_max_gr_db"]
        clipper_cap = intent["clipper_max_db"]

    return TargetContext(
        delivery=delivery,
        ceiling_dbtp=ceiling,
        preset=(intent or {}).get("name"),
        limiter_budget_cap_db=limiter_cap,
        clipper_max_share_db=C.CLIPPER_MAX_SHARE_DB if clipper_cap is None else min(C.CLIPPER_MAX_SHARE_DB, clipper_cap),
        genre=genre,
        style=style,
        category=category,
        flavour=flavour if category else None,
        tags=tags,
        tonal_target_db=target,
        tolerance_low_db=tol_low,
        tolerance_high_db=tol_high,
        preferred_lufs=round(preferred, 2),
        acceptable_min_lufs=round(min_lufs, 2),
        acceptable_max_lufs=round(max_lufs, 2),
        max_lufs_reduce_db=float(style_profile.get("max_lufs_reduce_db", -2.0)),
        target_crest_db=float(np.clip(target_crest, 5.0, 14.5)),
        max_stereo_width=float(np.clip(width, 0.0, 1.4)),
        saturation_allowance=float(np.clip(saturation, 0.0, C.SATURATION_MAX_AMOUNT)),
        compression_aggression=float(compression_aggression),
        hf_boost_multiplier=hf_mult,
        deesser_intent=deesser_intent,
        preservation_priorities=priorities,
        transient_safety=dict(profile.get("transient_safety", {})),
        reference_used=reference_used,
        intent_notes=notes,
        style_profile=dict(style_profile),
    )
