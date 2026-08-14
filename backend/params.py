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
    },
    "rock": {
        "target_lufs": -9.5,
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
}


def list_genres() -> list[str]:
    return list(GENRE_TARGET_PROFILES.keys())


def list_tags() -> list[str]:
    return list(ADJUSTMENT_TAG_BIASES.keys())


def list_styles() -> list[str]:
    return list(MASTERING_STYLE_PROFILES.keys())
