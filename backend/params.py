"""Adaptive target profiles and user-facing mastering tags."""

SPECTRAL_BAND_KEYS = [
    "sub_bass_20_60hz",
    "bass_60_250hz",
    "low_mid_250_500hz",
    "mid_500_2000hz",
    "high_mid_2000_4000hz",
    "presence_4000_6000hz",
    "brilliance_6000_20000hz",
]


GENRE_TARGET_PROFILES = {
    "pop": {
        "target_lufs": -9.0,
        "target_dynamic_range_db": 7.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.09,
            "bass_60_250hz": 0.17,
            "low_mid_250_500hz": 0.12,
            "mid_500_2000hz": 0.26,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.11,
        },
        "max_stereo_width": 1.25,
        "base_saturation": 0.12,
        "preservation_priorities": {
            "transients": 0.75,
            "drum_punch": 0.75,
            "dynamic_contrast": 0.65,
            "low_end_impact": 0.7,
            "stereo_image": 0.7,
            "tonal_character": 0.8,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "hiphop": {
        "target_lufs": -8.0,
        "target_dynamic_range_db": 7.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.14,
            "bass_60_250hz": 0.20,
            "low_mid_250_500hz": 0.10,
            "mid_500_2000hz": 0.24,
            "high_mid_2000_4000hz": 0.12,
            "presence_4000_6000hz": 0.10,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.15,
        "base_saturation": 0.16,
        "preservation_priorities": {
            "transients": 0.8,
            "drum_punch": 0.9,
            "dynamic_contrast": 0.6,
            "low_end_impact": 0.9,
            "stereo_image": 0.6,
            "tonal_character": 0.7,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "rock": {
        # -10.5 rather than -9.5 — commonly-cited professional rock master
        # ranges run roughly -14 to -10 LUFS; -9.5 sat just outside that.
        "target_lufs": -10.5,
        "target_dynamic_range_db": 9.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.09,
            "bass_60_250hz": 0.20,
            "low_mid_250_500hz": 0.14,
            "mid_500_2000hz": 0.23,
            "high_mid_2000_4000hz": 0.13,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.12,
        "base_saturation": 0.08,
        "preservation_priorities": {
            "transients": 0.92,
            "drum_punch": 0.92,
            "dynamic_contrast": 0.85,
            "low_end_impact": 0.75,
            "stereo_image": 0.65,
            "tonal_character": 0.8,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "edm": {
        "target_lufs": -7.0,
        "target_dynamic_range_db": 6.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.12,
            "bass_60_250hz": 0.20,
            "low_mid_250_500hz": 0.09,
            "mid_500_2000hz": 0.22,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.12,
        },
        "max_stereo_width": 1.35,
        "base_saturation": 0.18,
        "preservation_priorities": {
            "transients": 0.65,
            "drum_punch": 0.85,
            "dynamic_contrast": 0.45,
            "low_end_impact": 0.88,
            "stereo_image": 0.8,
            "tonal_character": 0.7,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "acoustic": {
        "target_lufs": -14.0,
        "target_dynamic_range_db": 11.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.05,
            "bass_60_250hz": 0.15,
            "low_mid_250_500hz": 0.14,
            "mid_500_2000hz": 0.30,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.12,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.10,
        "base_saturation": 0.08,
        "preservation_priorities": {
            "transients": 0.85,
            "drum_punch": 0.55,
            "dynamic_contrast": 0.92,
            "low_end_impact": 0.5,
            "stereo_image": 0.75,
            "tonal_character": 0.85,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "lofi": {
        "target_lufs": -12.0,
        "target_dynamic_range_db": 9.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.10,
            "bass_60_250hz": 0.18,
            "low_mid_250_500hz": 0.16,
            "mid_500_2000hz": 0.26,
            "high_mid_2000_4000hz": 0.12,
            "presence_4000_6000hz": 0.09,
            "brilliance_6000_20000hz": 0.09,
        },
        "max_stereo_width": 1.0,
        "base_saturation": 0.14,
        "preservation_priorities": {
            "transients": 0.55,
            "drum_punch": 0.6,
            "dynamic_contrast": 0.55,
            "low_end_impact": 0.6,
            "stereo_image": 0.55,
            "tonal_character": 0.65,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "podcast": {
        "target_lufs": -16.0,
        "target_dynamic_range_db": 7.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.03,
            "bass_60_250hz": 0.15,
            "low_mid_250_500hz": 0.16,
            "mid_500_2000hz": 0.33,
            "high_mid_2000_4000hz": 0.16,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.06,
        },
        "max_stereo_width": 0.2,
        "base_saturation": 0.06,
        "preservation_priorities": {
            "transients": 0.35,
            "drum_punch": 0.2,
            "dynamic_contrast": 0.55,
            "low_end_impact": 0.25,
            "stereo_image": 0.2,
            "tonal_character": 0.6,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "classical": {
        "target_lufs": -18.0,
        "target_dynamic_range_db": 14.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.06,
            "bass_60_250hz": 0.16,
            "low_mid_250_500hz": 0.14,
            "mid_500_2000hz": 0.28,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.12,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.20,
        "base_saturation": 0.04,
        "preservation_priorities": {
            "transients": 0.9,
            "drum_punch": 0.4,
            "dynamic_contrast": 0.97,
            "low_end_impact": 0.45,
            "stereo_image": 0.85,
            "tonal_character": 0.9,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    # Everything below extends genre coverage per the "genre awareness"
    # requirement — each profile is a real, distinct target (LUFS/DR/
    # spectral shape), not a copy of a neighboring genre with the name
    # swapped. Values are informed extrapolations from the eight profiles
    # above (same reasoning: sub-heavy + dense mids for bass/rhythm-driven
    # genres, wide LUFS/DR headroom for acoustic/orchestral ones) — same as
    # every existing profile, genre is still just the *target*; the
    # per-track analysis in mastering_params.py still decides how much (if
    # any) correction a given source actually needs.
    "metal": {
        "target_lufs": -9.0,
        "target_dynamic_range_db": 7.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.07,
            "bass_60_250hz": 0.19,
            "low_mid_250_500hz": 0.15,
            "mid_500_2000hz": 0.22,
            "high_mid_2000_4000hz": 0.15,
            "presence_4000_6000hz": 0.12,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.05,
        "base_saturation": 0.10,
        "preservation_priorities": {
            "transients": 0.93,
            "drum_punch": 0.93,
            "dynamic_contrast": 0.8,
            "low_end_impact": 0.8,
            "stereo_image": 0.6,
            "tonal_character": 0.78,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "trap": {
        "target_lufs": -8.5,
        "target_dynamic_range_db": 6.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.17,
            "bass_60_250hz": 0.19,
            "low_mid_250_500hz": 0.09,
            "mid_500_2000hz": 0.22,
            "high_mid_2000_4000hz": 0.12,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.10,
        "base_saturation": 0.16,
        "preservation_priorities": {
            "transients": 0.75,
            "drum_punch": 0.9,
            "dynamic_contrast": 0.55,
            "low_end_impact": 0.92,
            "stereo_image": 0.65,
            "tonal_character": 0.68,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "rnb": {
        "target_lufs": -10.5,
        "target_dynamic_range_db": 8.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.08,
            "bass_60_250hz": 0.17,
            "low_mid_250_500hz": 0.12,
            "mid_500_2000hz": 0.29,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.10,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.15,
        "base_saturation": 0.10,
        "preservation_priorities": {
            "transients": 0.7,
            "drum_punch": 0.7,
            "dynamic_contrast": 0.75,
            "low_end_impact": 0.72,
            "stereo_image": 0.68,
            "tonal_character": 0.85,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "reggaeton": {
        # -8.0 rather than -7.5 — commonly-cited professional reggaeton
        # ranges run roughly -11 to -8 LUFS; -7.5 sat just outside that.
        "target_lufs": -8.0,
        "target_dynamic_range_db": 6.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.13,
            "bass_60_250hz": 0.21,
            "low_mid_250_500hz": 0.10,
            "mid_500_2000hz": 0.23,
            "high_mid_2000_4000hz": 0.13,
            "presence_4000_6000hz": 0.10,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.20,
        "base_saturation": 0.14,
        "preservation_priorities": {
            "transients": 0.72,
            "drum_punch": 0.88,
            "dynamic_contrast": 0.5,
            "low_end_impact": 0.9,
            "stereo_image": 0.65,
            "tonal_character": 0.7,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "latin": {
        "target_lufs": -8.5,
        "target_dynamic_range_db": 7.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.08,
            "bass_60_250hz": 0.18,
            "low_mid_250_500hz": 0.12,
            "mid_500_2000hz": 0.26,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.11,
        },
        "max_stereo_width": 1.15,
        "base_saturation": 0.12,
        "preservation_priorities": {
            "transients": 0.78,
            "drum_punch": 0.82,
            "dynamic_contrast": 0.65,
            "low_end_impact": 0.75,
            "stereo_image": 0.7,
            "tonal_character": 0.78,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "house": {
        "target_lufs": -7.5,
        "target_dynamic_range_db": 6.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.11,
            "bass_60_250hz": 0.21,
            "low_mid_250_500hz": 0.09,
            "mid_500_2000hz": 0.22,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.12,
        },
        "max_stereo_width": 1.30,
        "base_saturation": 0.16,
        "preservation_priorities": {
            "transients": 0.6,
            "drum_punch": 0.82,
            "dynamic_contrast": 0.42,
            "low_end_impact": 0.85,
            "stereo_image": 0.82,
            "tonal_character": 0.68,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "techno": {
        "target_lufs": -7.5,
        "target_dynamic_range_db": 6.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.14,
            "bass_60_250hz": 0.22,
            "low_mid_250_500hz": 0.09,
            "mid_500_2000hz": 0.20,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.20,
        "base_saturation": 0.14,
        "preservation_priorities": {
            "transients": 0.58,
            "drum_punch": 0.85,
            "dynamic_contrast": 0.4,
            "low_end_impact": 0.88,
            "stereo_image": 0.78,
            "tonal_character": 0.62,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "dnb": {
        "target_lufs": -8.0,
        "target_dynamic_range_db": 7.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.15,
            "bass_60_250hz": 0.19,
            "low_mid_250_500hz": 0.08,
            "mid_500_2000hz": 0.21,
            "high_mid_2000_4000hz": 0.15,
            "presence_4000_6000hz": 0.11,
            "brilliance_6000_20000hz": 0.11,
        },
        "max_stereo_width": 1.25,
        "base_saturation": 0.14,
        "preservation_priorities": {
            "transients": 0.85,
            "drum_punch": 0.9,
            "dynamic_contrast": 0.55,
            "low_end_impact": 0.85,
            "stereo_image": 0.72,
            "tonal_character": 0.65,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "afrobeats": {
        "target_lufs": -9.5,
        "target_dynamic_range_db": 8.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.09,
            "bass_60_250hz": 0.20,
            "low_mid_250_500hz": 0.13,
            "mid_500_2000hz": 0.25,
            "high_mid_2000_4000hz": 0.13,
            "presence_4000_6000hz": 0.10,
            "brilliance_6000_20000hz": 0.10,
        },
        "max_stereo_width": 1.15,
        "base_saturation": 0.12,
        "preservation_priorities": {
            "transients": 0.78,
            "drum_punch": 0.83,
            "dynamic_contrast": 0.68,
            "low_end_impact": 0.8,
            "stereo_image": 0.7,
            "tonal_character": 0.75,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "singer_songwriter": {
        "target_lufs": -14.5,
        "target_dynamic_range_db": 11.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.04,
            "bass_60_250hz": 0.14,
            "low_mid_250_500hz": 0.14,
            "mid_500_2000hz": 0.31,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.12,
            "brilliance_6000_20000hz": 0.11,
        },
        "max_stereo_width": 1.05,
        "base_saturation": 0.06,
        "preservation_priorities": {
            "transients": 0.8,
            "drum_punch": 0.45,
            "dynamic_contrast": 0.93,
            "low_end_impact": 0.4,
            "stereo_image": 0.72,
            "tonal_character": 0.88,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "jazz": {
        "target_lufs": -15.0,
        "target_dynamic_range_db": 12.0,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.05,
            "bass_60_250hz": 0.16,
            "low_mid_250_500hz": 0.14,
            "mid_500_2000hz": 0.29,
            "high_mid_2000_4000hz": 0.13,
            "presence_4000_6000hz": 0.12,
            "brilliance_6000_20000hz": 0.11,
        },
        "max_stereo_width": 1.15,
        "base_saturation": 0.05,
        "preservation_priorities": {
            "transients": 0.88,
            "drum_punch": 0.6,
            "dynamic_contrast": 0.95,
            "low_end_impact": 0.55,
            "stereo_image": 0.8,
            "tonal_character": 0.9,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
    "cinematic": {
        "target_lufs": -18.0,
        "target_dynamic_range_db": 13.5,
        "target_spectral_balance": {
            "sub_bass_20_60hz": 0.07,
            "bass_60_250hz": 0.15,
            "low_mid_250_500hz": 0.13,
            "mid_500_2000hz": 0.27,
            "high_mid_2000_4000hz": 0.14,
            "presence_4000_6000hz": 0.13,
            "brilliance_6000_20000hz": 0.11,
        },
        "max_stereo_width": 1.25,
        "base_saturation": 0.05,
        "preservation_priorities": {
            "transients": 0.9,
            "drum_punch": 0.65,
            "dynamic_contrast": 0.96,
            "low_end_impact": 0.6,
            "stereo_image": 0.88,
            "tonal_character": 0.88,
        },
        "transient_safety": {
            "enabled": True,
            "quality_over_loudness": True,
            "allow_compressor_bypass": True,
            "allow_clipper_bypass": True,
            "allow_saturation_bypass": True,
            "allow_limiter_backoff": True,
        },
    },
}


ADJUSTMENT_TAG_BIASES = {
    "better_vocals": {"vocal_presence_delta": 0.02, "presence_band_boost_db": 1.5, "deesser_strength": 0.5},
    "deeper": {"band_bias_db": {"sub_bass_20_60hz": 1.5, "bass_60_250hz": 1.0, "low_mid_250_500hz": -0.5}},
    "brighter": {"band_bias_db": {"presence_4000_6000hz": 1.5, "brilliance_6000_20000hz": 2.0}},
    "warmer": {"band_bias_db": {"low_mid_250_500hz": 1.5, "brilliance_6000_20000hz": -1.0}, "saturation_delta": 0.08},
    "louder": {"target_lufs_delta": -1.5, "compression_aggression_delta": 0.4},
    "wider": {"max_stereo_width_delta": 0.15},
    "punchier_drums": {"band_bias_db": {"bass_60_250hz": 0.8, "high_mid_2000_4000hz": 0.5}, "compression_aggression_delta": -0.2},
    "clearer": {"band_bias_db": {"low_mid_250_500hz": -1.5, "presence_4000_6000hz": 1.0}},
    "softer": {"target_lufs_delta": 1.5, "compression_aggression_delta": -0.5, "max_stereo_width_delta": -0.05},
}


# Mastering style profiles emulate common era-specific outcomes used by engineers.
# They bias targets while preserving adaptive, analysis-driven behavior.
MASTERING_STYLE_PROFILES = {
    "modern": {
        "target_lufs_delta": -1.0,
        "target_dynamic_range_delta": 0.9,
        "max_stereo_width_delta": 0.0,
        "saturation_delta": -0.02,
        "hf_boost_cap_db": 0.75,
        "max_lufs_raise_db": 1.2,
        "max_lufs_reduce_db": -2.0,
    },
    "rock_90s": {
        "target_lufs_delta": -2.0,
        "target_dynamic_range_delta": 1.8,
        "max_stereo_width_delta": -0.08,
        "saturation_delta": -0.04,
        "hf_boost_cap_db": 0.6,
        "max_lufs_raise_db": 1.0,
        "max_lufs_reduce_db": -1.2,
    },
    "rock_2000s": {
        "target_lufs_delta": -0.8,
        "target_dynamic_range_delta": 0.8,
        "max_stereo_width_delta": -0.03,
        "saturation_delta": -0.01,
        "hf_boost_cap_db": 0.9,
        "max_lufs_raise_db": 1.5,
        "max_lufs_reduce_db": -1.5,
    },
    "rock_modern": {
        "target_lufs_delta": 0.0,
        "target_dynamic_range_delta": 0.8,
        "max_stereo_width_delta": 0.02,
        "saturation_delta": 0.02,
        "hf_boost_cap_db": 1.1,
        "max_lufs_raise_db": 4.5,
        "max_lufs_reduce_db": -2.2,
    },
    "electronic_modern": {
        "target_lufs_delta": 0.8,
        "target_dynamic_range_delta": -1.0,
        "max_stereo_width_delta": 0.08,
        "saturation_delta": 0.05,
        "hf_boost_cap_db": 1.3,
        "max_lufs_raise_db": 2.8,
        "max_lufs_reduce_db": -2.5,
    },
    "stock_mastering_strip": {
        "target_lufs_delta": -1.4,
        "target_dynamic_range_delta": 1.4,
        "max_stereo_width_delta": 0.0,
        "saturation_delta": -0.03,
        "hf_boost_cap_db": 0.72,
        "max_lufs_raise_db": 0.9,
        "max_lufs_reduce_db": -1.6,
    },
    # Below: broader era/production-lineage coverage, same reasoning as the
    # six above (bias targets, never a fixed preset — the per-track
    # analysis in mastering_params.py still decides how much correction a
    # given source actually needs).
    "vintage_analog": {
        # 60s-70s tape mastering: quiet by modern standards, wide open
        # dynamics, narrow/mono-leaning stereo image (pre-wide-stereo-
        # mastering norms), soft top end, tape warmth from saturation.
        "target_lufs_delta": -3.0,
        "target_dynamic_range_delta": 3.0,
        "max_stereo_width_delta": -0.15,
        "saturation_delta": 0.10,
        "hf_boost_cap_db": 0.3,
        "max_lufs_raise_db": 0.5,
        "max_lufs_reduce_db": -1.0,
    },
    "cd_loudness_war": {
        # Early/mid-2000s brickwalled CD mastering — the extreme case the
        # rest of this app deliberately avoids by default. Available as an
        # explicit, opt-in style rather than baked into "modern."
        "target_lufs_delta": 1.2,
        "target_dynamic_range_delta": -3.0,
        "max_stereo_width_delta": 0.0,
        "saturation_delta": 0.02,
        "hf_boost_cap_db": 1.0,
        "max_lufs_raise_db": 3.2,
        "max_lufs_reduce_db": -3.0,
    },
    "vinyl_master": {
        # Mastering for a physical vinyl cut: conservative/narrower low-end
        # width (a vinyl groove can't track hard-panned or wide sub-bass
        # without skipping), rolled-off extreme highs, dynamics preserved
        # since a cutting lathe can't be brickwalled the way digital can.
        "target_lufs_delta": -2.2,
        "target_dynamic_range_delta": 2.2,
        "max_stereo_width_delta": -0.25,
        "saturation_delta": 0.06,
        "hf_boost_cap_db": 0.4,
        "max_lufs_raise_db": 0.6,
        "max_lufs_reduce_db": -1.4,
    },
    "streaming_safe": {
        # Explicitly optimized for loudness-normalizing platforms (Spotify
        # et al target roughly -14 LUFS and warn about true-peak-driven
        # encoding distortion above ~-2dBTP) rather than competing on raw
        # loudness — quieter and more dynamic than "modern" on purpose.
        "target_lufs_delta": 2.2,
        "target_dynamic_range_delta": 1.3,
        "max_stereo_width_delta": 0.0,
        "saturation_delta": -0.03,
        "hf_boost_cap_db": 0.7,
        "max_lufs_raise_db": 0.5,
        "max_lufs_reduce_db": -2.3,
    },
    "hiphop_golden_era": {
        # 90s boom-bap: warm, punchy, moderate loudness — not brickwalled,
        # bass-forward without being sub-hi-fi trap-modern.
        "target_lufs_delta": -1.5,
        "target_dynamic_range_delta": 1.2,
        "max_stereo_width_delta": -0.10,
        "saturation_delta": 0.09,
        "hf_boost_cap_db": 0.5,
        "max_lufs_raise_db": 0.8,
        "max_lufs_reduce_db": -1.3,
    },
    "hiphop_modern_trap": {
        # Current trap/hip-hop mastering norms: loud, tight, sub-forward,
        # bright hats/top end.
        "target_lufs_delta": 0.5,
        "target_dynamic_range_delta": -1.2,
        "max_stereo_width_delta": 0.05,
        "saturation_delta": 0.06,
        "hf_boost_cap_db": 1.1,
        "max_lufs_raise_db": 2.6,
        "max_lufs_reduce_db": -2.4,
    },
    "pop_80s": {
        # Bright, wide, gated-drum-era pop mastering — moderate loudness by
        # today's standards but noticeably brighter/wider than "modern."
        "target_lufs_delta": -1.8,
        "target_dynamic_range_delta": 1.0,
        "max_stereo_width_delta": 0.10,
        "saturation_delta": 0.03,
        "hf_boost_cap_db": 1.2,
        "max_lufs_raise_db": 1.0,
        "max_lufs_reduce_db": -1.5,
    },
    "edm_festival": {
        # Big-room/festival EDM: very loud, tight, bright, maximally wide.
        "target_lufs_delta": 1.0,
        "target_dynamic_range_delta": -1.5,
        "max_stereo_width_delta": 0.15,
        "saturation_delta": 0.06,
        "hf_boost_cap_db": 1.4,
        "max_lufs_raise_db": 3.2,
        "max_lufs_reduce_db": -2.6,
    },
    "acoustic_natural": {
        # Audiophile-natural mastering for acoustic/singer-songwriter
        # material — minimal processing, wide dynamics, almost no push.
        "target_lufs_delta": 3.0,
        "target_dynamic_range_delta": 2.5,
        "max_stereo_width_delta": -0.05,
        "saturation_delta": -0.04,
        "hf_boost_cap_db": 0.4,
        "max_lufs_raise_db": 0.3,
        "max_lufs_reduce_db": -2.8,
    },
    "cinematic_score": {
        # Film-score mastering philosophy: maximum preserved dynamic
        # range, spacious width, essentially no loudness push.
        "target_lufs_delta": 4.0,
        "target_dynamic_range_delta": 3.5,
        "max_stereo_width_delta": 0.10,
        "saturation_delta": -0.04,
        "hf_boost_cap_db": 0.5,
        "max_lufs_raise_db": 0.2,
        "max_lufs_reduce_db": -3.0,
    },
}


# Mastering *categories* are the musical-objective layer the "complete DSP
# overhaul" spec asks for: not another set of fixed DSP presets, but a bias
# on top of the genre target + analysis-driven correction that already runs
# in mastering_params.py — "make this decision the way a Clean/Transparent
# master would, vs a Club/DJ master". A category is optional; with none
# selected, genre + style behave exactly as before this existed.
#
# Shape, applied in compute_processing_params (mastering_params.py):
#   target_lufs_delta / target_dynamic_range_delta / max_stereo_width_delta /
#   saturation_delta            -> added alongside the existing style deltas
#   compression_aggression_delta -> folded into profile["compression_aggression_delta"]
#   hf_boost_cap_delta          -> added to the style's hf_boost_cap_db
#   max_lufs_raise_delta        -> added to the style's max_lufs_raise_db ceiling
#   vocal_presence_delta        -> folded into profile["vocal_presence_target_delta"]
#   tweak_bias                  -> a partial {low_end,punch,presence,brightness,
#                                   warmth,width,loudness} dict, merged additively
#                                   with the user's own tweak sliders before
#                                   _apply_user_tweaks runs (mastering.py) — this
#                                   is how a category expresses "more punch" or
#                                   "warmer" without duplicating that per-band
#                                   logic a second time.
# Every field is optional per category/flavour; missing = 0.0 contribution.
MASTERING_CATEGORY_PROFILES = {
    "clean": {
        "label": "Clean / Transparent",
        "description": "For already-good mixes — preserve the mix, subtle correction only, minimal coloration.",
        "target_lufs_delta": 1.0,
        "target_dynamic_range_delta": 1.5,
        "saturation_delta": -0.06,
        "compression_aggression_delta": -0.4,
        "hf_boost_cap_delta": -0.10,
        "max_lufs_raise_delta": -0.8,
        "tweak_bias": {},
    },
    "modern": {
        "label": "Modern / Loud",
        "description": "Competitive perceived loudness with controlled transients — dense but clean, not chasing LUFS at the expense of quality.",
        "target_lufs_delta": -0.5,
        "target_dynamic_range_delta": -0.5,
        "saturation_delta": 0.0,
        "compression_aggression_delta": 0.3,
        "hf_boost_cap_delta": 0.1,
        "max_lufs_raise_delta": 0.5,
        "tweak_bias": {"punch": 0.15},
    },
    "dynamic": {
        "label": "Dynamic / Open",
        "description": "Acoustic, cinematic, jazz, classical, live — preserve natural dynamics and transient detail.",
        "target_lufs_delta": 2.0,
        "target_dynamic_range_delta": 2.5,
        "saturation_delta": -0.05,
        "compression_aggression_delta": -0.6,
        "hf_boost_cap_delta": -0.05,
        "max_lufs_raise_delta": -1.5,
        "tweak_bias": {},
    },
    "punch": {
        "label": "Punch / Impact",
        "description": "Rock, hip-hop, trap, pop, EDM — preserve kick/snare impact, increase perceived energy without flattening the mix.",
        "target_lufs_delta": -0.3,
        "max_stereo_width_delta": -0.02,
        "saturation_delta": 0.02,
        "compression_aggression_delta": 0.1,
        "hf_boost_cap_delta": 0.15,
        "max_lufs_raise_delta": 0.3,
        "tweak_bias": {"punch": 0.5},
    },
    "club": {
        "label": "Club / DJ",
        "description": "Electronic/dance/club-oriented — strong low-end translation, controlled sub, stable stereo image, high playback-level integrity.",
        "target_lufs_delta": -0.8,
        "target_dynamic_range_delta": -1.0,
        "max_stereo_width_delta": 0.05,
        "saturation_delta": 0.05,
        "compression_aggression_delta": 0.35,
        "hf_boost_cap_delta": 0.1,
        "max_lufs_raise_delta": 0.8,
        "tweak_bias": {"low_end": 0.15, "punch": 0.4},
    },
    "warm": {
        "label": "Warm / Analog",
        "description": "Harmonic density and smoother transients — subtle saturation and tonal shaping, only when it improves the source.",
        "target_lufs_delta": 0.3,
        "target_dynamic_range_delta": 0.3,
        "max_stereo_width_delta": -0.03,
        "saturation_delta": 0.10,
        "compression_aggression_delta": -0.1,
        "hf_boost_cap_delta": -0.2,
        "tweak_bias": {"warmth": 0.4},
    },
    "bright": {
        "label": "Bright / Air",
        "description": "For mixes that genuinely lack openness or high-frequency detail — subtle top-end enhancement, never on already-bright material.",
        "max_stereo_width_delta": 0.02,
        "saturation_delta": -0.02,
        "hf_boost_cap_delta": 0.4,
        "tweak_bias": {"brightness": 0.4},
    },
    "vocal_focus": {
        "label": "Vocal Focus",
        "description": "Vocal-driven material — intelligibility and midrange clarity without destroying the instrumental balance.",
        "target_lufs_delta": 0.2,
        "target_dynamic_range_delta": 0.3,
        "max_stereo_width_delta": -0.02,
        "compression_aggression_delta": -0.1,
        "vocal_presence_delta": 0.03,
        "tweak_bias": {"presence": 0.35},
    },
    "bass_control": {
        "label": "Bass / Low-End Control",
        "description": "For tracks whose main problem is low-frequency balance — sub control and kick/bass relationship, never an automatic bass cut.",
        "compression_aggression_delta": 0.15,
        "tweak_bias": {"low_end": -0.35, "punch": 0.2},
    },
}


# Flavours: 2-3 named variations per category, small additional nudges on
# top of that category's profile — they are targets that influence the
# mastering strategy, not fixed parameter presets (the per-track analysis in
# mastering_params.py still decides how much correction the source actually
# needs). Same field shape as MASTERING_CATEGORY_PROFILES entries, applied
# additively on top of the parent category.
MASTERING_FLAVOURS = {
    "clean": {
        "transparent": {"target_lufs_delta": 0.4, "compression_aggression_delta": -0.2, "tweak_bias": {}},
        "detailed": {"hf_boost_cap_delta": 0.15, "tweak_bias": {"presence": 0.15}},
        "balanced": {},
    },
    "modern": {
        "competitive": {"max_lufs_raise_delta": 0.6, "compression_aggression_delta": 0.15},
        "punchy": {"tweak_bias": {"punch": 0.2}},
        "dense": {"compression_aggression_delta": 0.25, "saturation_delta": 0.03},
    },
    "dynamic": {
        "open": {"target_dynamic_range_delta": 0.6, "hf_boost_cap_delta": 0.1},
        "natural": {},
        "wide": {"max_stereo_width_delta": 0.08, "tweak_bias": {"width": 0.2}},
    },
    "punch": {
        "transient": {"compression_aggression_delta": -0.15, "tweak_bias": {"punch": 0.15}},
        "impact": {"target_lufs_delta": -0.2, "tweak_bias": {"low_end": 0.1}},
        "forward": {"vocal_presence_delta": 0.02, "tweak_bias": {"presence": 0.15}},
    },
    "club": {
        "powerful": {"tweak_bias": {"low_end": 0.15}},
        "deep": {"tweak_bias": {"low_end": 0.3}, "hf_boost_cap_delta": -0.1},
        "aggressive": {"compression_aggression_delta": 0.2, "saturation_delta": 0.04},
    },
    "warm": {
        "analog": {"saturation_delta": 0.03, "hf_boost_cap_delta": -0.1},
        "smooth": {"compression_aggression_delta": -0.15},
        "saturated": {"saturation_delta": 0.06},
    },
    "bright": {
        "airy": {"hf_boost_cap_delta": 0.2},
        "crisp": {"tweak_bias": {"brightness": 0.15, "presence": 0.15}},
    },
    "vocal_focus": {
        "intimate": {"target_lufs_delta": 0.3, "compression_aggression_delta": -0.15},
        "present": {"vocal_presence_delta": 0.02, "tweak_bias": {"presence": 0.2}},
    },
    "bass_control": {
        "tight": {"tweak_bias": {"punch": 0.15}},
        "controlled": {"compression_aggression_delta": 0.1},
    },
}


def list_genres() -> list[str]:
    return list(GENRE_TARGET_PROFILES.keys())


def list_tags() -> list[str]:
    return list(ADJUSTMENT_TAG_BIASES.keys())


def list_styles() -> list[str]:
    return list(MASTERING_STYLE_PROFILES.keys())


def list_categories() -> list[str]:
    return list(MASTERING_CATEGORY_PROFILES.keys())


def list_flavours(category: str | None = None) -> list[str] | dict[str, list[str]]:
    if category is not None:
        return list(MASTERING_FLAVOURS.get(category, {}).keys())
    return {cat: list(flavours.keys()) for cat, flavours in MASTERING_FLAVOURS.items()}
