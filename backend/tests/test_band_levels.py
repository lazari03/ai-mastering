"""Tests for absolute band measurement and output validation.

The central property under test is the one shares cannot provide:
INDEPENDENCE. Cutting the bass must not change what the presence band
reports. Every other guarantee in output_validation.py rests on that.

Fixtures are synthesised rather than loaded from audio files so the
expected answer is known exactly — if a 6 dB cut is applied, the
measurement must report ~6 dB, and any deviation is the measurement's
fault rather than an unknown property of some recording.
"""

from __future__ import annotations

import numpy as np
import pytest

from ai_mastering.band_levels import (
    BAND_EDGES_HZ,
    band_levels_db,
    level_deltas_db,
    loudness_matched_band_deltas,
)
from ai_mastering.output_validation import GuardrailConfig, validate_render

SR = 44100
DUR = 4.0


def _t(n_seconds: float = DUR) -> np.ndarray:
    return np.linspace(0.0, n_seconds, int(SR * n_seconds), endpoint=False, dtype=np.float32)


def _stereo(mono: np.ndarray) -> np.ndarray:
    return np.stack([mono, mono], axis=1).astype(np.float32)


def _tone(freq: float, amp: float = 0.2, n_seconds: float = DUR) -> np.ndarray:
    return (amp * np.sin(2.0 * np.pi * freq * _t(n_seconds))).astype(np.float32)


def _noise(amp: float = 0.05, n_seconds: float = DUR, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return (amp * rng.standard_normal(int(SR * n_seconds))).astype(np.float32)


def _db(gain_db: float) -> float:
    return float(10.0 ** (gain_db / 20.0))


# NOTE: fixtures that need an EXACTLY known band change are built by
# synthesising the same tones at scaled amplitudes rather than by
# filtering. An IIR split (sosfilt -> `mono - part`) is phase-shifted, so
# the residual re-adds a rotated copy of the band instead of cancelling —
# measured as +0.6 dB where -6 dB was intended. Synthesis makes the
# expected answer exact, so a failure indicts the measurement rather than
# the fixture.


# ---------------------------------------------------------------------------
# Varied fixtures named in the task
# ---------------------------------------------------------------------------

def _bass_heavy() -> np.ndarray:
    return _stereo(_tone(50, 0.45) + _tone(90, 0.35) + _tone(700, 0.06) + _noise(0.01))


def _bright() -> np.ndarray:
    return _stereo(_tone(8000, 0.25) + _tone(5000, 0.2) + _tone(400, 0.05) + _noise(0.03, seed=2))


def _sparse_acoustic() -> np.ndarray:
    mono = _tone(220, 0.12) + _tone(440, 0.07) + _noise(0.004, seed=3)
    mono[: int(SR * 1.5)] *= 0.05  # quiet intro
    return _stereo(mono)


def _dense_rock() -> np.ndarray:
    mono = _tone(80, 0.25) + _tone(250, 0.18) + _tone(1200, 0.15) + _tone(4000, 0.1) + _noise(0.08, seed=4)
    return _stereo(np.clip(mono, -1.0, 1.0))


def _already_limited() -> np.ndarray:
    mono = _tone(100, 0.5) + _tone(1000, 0.4) + _noise(0.1, seed=5)
    return _stereo(np.clip(mono * 3.0, -0.99, 0.99))


def _quiet_dynamic() -> np.ndarray:
    mono = (_tone(150, 0.3) + _tone(900, 0.2)).astype(np.float32)
    env = np.linspace(0.02, 1.0, mono.size, dtype=np.float32)
    return _stereo((mono * env * 0.2).astype(np.float32))


def _with_silence_and_fades() -> np.ndarray:
    mono = _tone(120, 0.3) + _tone(2000, 0.15)
    n = mono.size
    mono[: n // 4] = 0.0                                        # leading silence
    fade = np.linspace(1.0, 0.0, n // 4, dtype=np.float32)
    mono[-(n // 4):] *= fade                                    # trailing fade
    return _stereo(mono.astype(np.float32))


ALL_FIXTURES = {
    "bass_heavy": _bass_heavy,
    "bright": _bright,
    "sparse_acoustic": _sparse_acoustic,
    "dense_rock": _dense_rock,
    "already_limited": _already_limited,
    "quiet_dynamic": _quiet_dynamic,
    "with_silence_and_fades": _with_silence_and_fades,
}


# ---------------------------------------------------------------------------
# Measurement correctness
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("name", sorted(ALL_FIXTURES))
def test_band_levels_are_finite_and_complete(name):
    levels = band_levels_db(ALL_FIXTURES[name](), SR)
    assert set(levels) == set(BAND_EDGES_HZ), "every band must be reported"
    assert all(np.isfinite(v) for v in levels.values()), f"non-finite level in {name}: {levels}"


def test_band_levels_are_independent_the_property_shares_cannot_provide():
    """Cutting the low end must NOT change what the presence band reports.

    This is the exact failure mode of share-based measurement: shares sum
    to 1.0, so attenuating bass mechanically inflates every other band.
    Here the presence tone is byte-identical between the two fixtures, so
    any reported movement in that band is purely a measurement artifact.
    """
    kick, presence = _tone(90, 0.40), _tone(5000, 0.10)
    src = _stereo(kick + presence)
    cut = _stereo(kick * _db(-9.0) + presence)   # ONLY the low end changes

    before, after = band_levels_db(src, SR), band_levels_db(cut, SR)

    assert after["kick_bass_60_120hz"] < before["kick_bass_60_120hz"] - 3.0, "the cut must register"
    # The untouched band must stay put. Shares would have risen here.
    drift = abs(after["presence_4000_6000hz"] - before["presence_4000_6000hz"])
    assert drift < 0.5, f"presence drifted {drift:.2f} dB from a low-end-only change"


def test_measured_cut_matches_applied_cut():
    """A known -6 dB cut must be reported as approximately -6 dB."""
    low, high = _tone(80, 0.3), _tone(3000, 0.1)
    src = _stereo(low + high)
    cut = _stereo(low * _db(-6.0) + high)
    delta = level_deltas_db(band_levels_db(src, SR), band_levels_db(cut, SR))
    assert -6.5 < delta["kick_bass_60_120hz"] < -5.5, f"expected -6 dB, got {delta['kick_bass_60_120hz']}"
    # And the untouched high band must not have moved with it.
    assert abs(delta["high_mid_2000_4000hz"]) < 0.5


def test_silence_and_fades_do_not_drag_levels_down():
    """Gating: the same music with silence bolted on must measure the same."""
    music = _tone(120, 0.3) + _tone(2000, 0.15)
    padded = np.concatenate([np.zeros(SR, dtype=np.float32), music, np.zeros(SR, dtype=np.float32)])
    a = band_levels_db(_stereo(music), SR)
    b = band_levels_db(_stereo(padded), SR)
    for band in ("kick_bass_60_120hz", "high_mid_2000_4000hz"):
        assert abs(a[band] - b[band]) < 1.0, f"{band} moved {a[band] - b[band]:.2f} dB from padding alone"


def test_level_is_duration_invariant():
    """Mean-not-sum: a longer take of the same material measures the same."""
    short = _stereo(_tone(500, 0.2, n_seconds=2.0))
    long = _stereo(_tone(500, 0.2, n_seconds=8.0))
    a, b = band_levels_db(short, SR), band_levels_db(long, SR)
    assert abs(a["mid_500_2000hz"] - b["mid_500_2000hz"]) < 0.5


def test_loudness_matching_removes_pure_gain():
    """A master that is only louder must show ~no per-band change."""
    src = _dense_rock()
    louder = (src * (10.0 ** (6.0 / 20.0))).astype(np.float32)
    deltas = loudness_matched_band_deltas(src, louder, SR, source_lufs=-18.0, rendered_lufs=-12.0)
    worst = max(abs(v) for v in deltas.values())
    assert worst < 0.5, f"gain-only change leaked into band deltas: {deltas}"


# ---------------------------------------------------------------------------
# Output validation — the case the task requires be caught
# ---------------------------------------------------------------------------

def _clean_args(**over):
    args = dict(
        band_deltas_db={b: 0.0 for b in BAND_EDGES_HZ},
        true_peak_dbtp=-1.2,
        rendered_lufs=-9.0,
        target_lufs=-9.0,
        transient_delta=0.0,
    )
    args.update(over)
    return args


def test_strong_sub_bass_cut_is_caught():
    deltas = {b: 0.0 for b in BAND_EDGES_HZ}
    deltas["sub_bass_35_60hz"] = -6.0
    deltas["kick_bass_60_120hz"] = -4.5
    result = validate_render(**_clean_args(band_deltas_db=deltas))
    assert not result.passed
    assert "low_end_loss" in {f.name for f in result.failures}
    assert "eq_low_shelf_and_highpass" in result.blamed_stages(), "must name a stage to reduce"


def test_high_frequency_boost_is_caught():
    deltas = {b: 0.0 for b in BAND_EDGES_HZ}
    deltas["high_6000_20000hz"] = 4.0
    result = validate_render(**_clean_args(band_deltas_db=deltas))
    assert not result.passed
    assert "high_frequency_boost" in {f.name for f in result.failures}


def test_subsonic_cut_is_allowed():
    """Cutting genuine rumble is legitimate and must NOT be flagged."""
    deltas = {b: 0.0 for b in BAND_EDGES_HZ}
    deltas["subsonic_20_35hz"] = -8.0
    assert validate_render(**_clean_args(band_deltas_db=deltas)).passed


def test_well_balanced_render_passes():
    assert validate_render(**_clean_args()).passed


def test_true_peak_over_ceiling_is_caught():
    r = validate_render(**_clean_args(true_peak_dbtp=-0.1))
    assert not r.passed and "true_peak_over_ceiling" in {f.name for f in r.failures}


def test_loudness_is_checked_against_the_supplied_target_not_a_fixed_number():
    """No universal LUFS target: -14 is a pass when -14 is what was asked for."""
    assert validate_render(**_clean_args(rendered_lufs=-14.0, target_lufs=-14.0)).passed
    assert not validate_render(**_clean_args(rendered_lufs=-14.0, target_lufs=-9.0)).passed


def test_transient_loss_is_caught_and_blames_dynamics_stages():
    r = validate_render(**_clean_args(transient_delta=-0.3))
    assert not r.passed
    assert "limiter_and_clipper" in r.blamed_stages()


def test_thresholds_are_configurable_guardrails():
    deltas = {b: 0.0 for b in BAND_EDGES_HZ}
    deltas["kick_bass_60_120hz"] = -3.0
    assert not validate_render(**_clean_args(band_deltas_db=deltas)).passed
    lenient = GuardrailConfig(max_low_end_loss_db=6.0)
    assert validate_render(**_clean_args(band_deltas_db=deltas), config=lenient).passed
