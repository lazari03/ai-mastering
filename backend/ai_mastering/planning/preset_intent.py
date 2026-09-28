"""Built-in presets are adaptive INTENTS, not literal chains.

mixing_presets.json (v3) describes each preset as permissions and leanings
— "boost 120 Hz by up to 0.5 dB, only if the analysis needs it", "aim for
-10.5 LUFS, accept -12.5..-9", "limiter at most 3 dB" — and marks itself
`"adaptive": {"enabled": true, "preset_strength": ...}`. That is exactly
what the adaptive engine's target context expresses, so a preset feeds it
the same way genre, style, tags and objective do: it moves the
destination and tightens the limits, and the engine still only corrects
what it measures.

A literal chain (explicit gain_db / amount / drive_db / target_lufs_i —
an imported JSON chain or the Pro manual panel) is the other format; it
goes to app/services/preset_dsp_engine.py unchanged.
"""

from __future__ import annotations

import numpy as np

# Keys only the intent format uses. Any of them — or adaptive.enabled —
# marks a preset as intent-style.
INTENT_KEYS = {
    "preferred_direction",
    "max_adjustment_db",
    "requires_detected_need",
    "requires_detected_problem",
    "preferred_lufs_i",
    "acceptable_lufs_i",
    "max_amount",
    "max_drive_db",
    "max_width_delta",
}

# Preset genres/styles that aren't in the engine's own tables, mapped to the
# nearest one the engine has a model for. The preset's own loudness range
# and limits still apply on top.
PRESET_GENRE_ALIASES = {"country": "rock", "reggae": "reggaeton"}
PRESET_STYLE_ALIASES = {"natural": "acoustic_natural"}

DEFAULT_STRENGTH = 0.65


def _walk_keys(value) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        for k, v in value.items():
            keys.add(k)
            keys |= _walk_keys(v)
    elif isinstance(value, list):
        for v in value:
            keys |= _walk_keys(v)
    return keys


def is_intent_preset(preset: dict | None) -> bool:
    if not preset:
        return False
    if (preset.get("adaptive") or {}).get("enabled"):
        return True
    return bool(_walk_keys(preset.get("processing") or {}) & INTENT_KEYS)


def resolve_genre(genre: str | None) -> str | None:
    return PRESET_GENRE_ALIASES.get(genre, genre) if genre else genre


def resolve_style(style: str | None) -> str | None:
    return PRESET_STYLE_ALIASES.get(style, style) if style else style


def _direction(value) -> float:
    return {"boost": 1.0, "widen": 1.0, "cut": -1.0, "narrow": -1.0}.get(str(value or "").lower(), 0.0)


def compile_intent(preset: dict) -> dict:
    """Reduce an intent preset to the numbers the target context uses."""
    processing = preset.get("processing") or {}
    adaptive = preset.get("adaptive") or {}
    strength = float(np.clip(float(adaptive.get("preset_strength", DEFAULT_STRENGTH)), 0.0, 1.0))

    eq = []
    for band in processing.get("eq") or []:
        hz, sign = band.get("frequency_hz"), _direction(band.get("preferred_direction"))
        if hz and sign:
            eq.append({"hz": float(hz), "db": sign * abs(float(band.get("max_adjustment_db", 0.0)))})

    limiter = processing.get("limiter") or {}
    acceptable = limiter.get("acceptable_lufs_i")
    loudness = None
    if limiter.get("preferred_lufs_i") is not None:
        loudness = {"preferred": float(limiter["preferred_lufs_i"])}
        if isinstance(acceptable, (list, tuple)) and len(acceptable) == 2:
            loudness["min"], loudness["max"] = sorted(float(x) for x in acceptable)

    saturation = processing.get("saturation") or {}
    clipper = processing.get("clipper") or {}
    bus = processing.get("bus_compressor") or {}
    width_delta = sum(_direction(b.get("preferred_direction")) * float(b.get("max_width_delta", 0.0)) for b in (processing.get("stereo") or {}).get("bands") or [])
    hf_dyn = [abs(float(b.get("max_gain_reduction_db", 0.0))) for b in processing.get("dynamic_eq") or [] if float(b.get("frequency_hz", 0.0)) >= 4000.0]

    return {
        "name": preset.get("name") or preset.get("display_name"),
        "strength": strength,
        "eq": eq,
        "loudness": loudness,
        "limiter_max_gr_db": float(limiter["max_gain_reduction_db"]) if limiter.get("max_gain_reduction_db") is not None else None,
        "saturation_max": (float(saturation.get("max_amount", 0.0)) if saturation.get("enabled", True) else 0.0) if saturation else None,
        "clipper_max_db": (float(clipper.get("max_drive_db", 0.0)) if clipper.get("enabled", True) else 0.0) if clipper else None,
        "bus_max_gr_db": float(bus["max_gain_reduction_db"]) if bus.get("max_gain_reduction_db") is not None else None,
        "width_delta": width_delta,
        "hf_dynamic_eq_db": max(hf_dyn) if hf_dyn else 0.0,
    }
