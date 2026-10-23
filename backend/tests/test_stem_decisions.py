"""Stem path follows measure -> decide: no fixed chorus rides, no fixed
reverb, and a vocal that already sits correctly is left exactly alone."""

from __future__ import annotations

import numpy as np
import pytest

from ai_mastering.stem_decisions import (
    SECTION_MAX_GAIN_DB,
    measure_vocal_relationship,
    plan_stem_moves,
)
from ai_mastering.stem_separation import _process_accompaniment_stem, _process_vocal_stem

SR = 44100
SECONDS = 60.0
CHORUS = (20.0, 32.0)
FINAL = (44.0, 56.0)
SECTIONS = {"method": "energy_profile", "chorus_regions": [CHORUS, FINAL], "bridge_region": None, "final_chorus_region": FINAL}


def _bandnoise(n, lo, hi, rng):
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    spec[(f < lo) | (f > hi)] = 0.0
    x = np.fft.irfft(spec, n=n)
    return (x / (np.sqrt(np.mean(x**2)) + 1e-12)).astype(np.float32)


def _gain_curve(n, regions_db):
    g = np.zeros(n, dtype=np.float32)
    t = np.arange(n) / SR
    for (s, e), db in regions_db:
        g[(t >= s) & (t < e)] = db
    return (10.0 ** (g / 20.0)).astype(np.float32)


def _stems(accompaniment_boost_db=None, vocal_spread_db=0.0, seed=0):
    rng = np.random.default_rng(seed)
    n = int(SR * SECONDS)
    # Sung phrases: 1.6 s on / 0.4 s off, vocal-band noise.
    t = np.arange(n) / SR
    phrase = ((t % 2.0) < 1.6).astype(np.float32)
    voice = _bandnoise(n, 200.0, 5000.0, rng) * phrase * 0.1
    if vocal_spread_db:
        swing = 10.0 ** ((vocal_spread_db / 2.0) * np.sign(np.sin(2 * np.pi * t / 8.0)) / 20.0)
        voice = voice * swing.astype(np.float32)
    acc = _bandnoise(n, 40.0, 16000.0, rng) * 0.1
    if accompaniment_boost_db:
        acc = acc * _gain_curve(n, accompaniment_boost_db)
    return np.stack([voice, voice], axis=1), np.stack([acc, acc * 0.9], axis=1)


def test_vocal_that_sits_correctly_is_left_exactly_alone():
    vocals, acc = _stems()
    m = measure_vocal_relationship(vocals, acc, SR, SECTIONS)
    moves = plan_stem_moves(m, {})
    assert moves["section_vocal_gain_db"] == {"chorus": 0.0, "bridge": 0.0, "final_chorus": 0.0}
    assert moves["accompaniment_presence_cut_db"] == 0.0
    assert moves["vocal_compression_ratio"] == 1.0
    v_out, v_info = _process_vocal_stem(vocals, SR, moves)
    a_out, a_info = _process_accompaniment_stem(acc, SR, moves)
    assert v_info["unchanged"] and a_info["unchanged"]
    # Recombining untouched stems returns the original mix bit-for-bit.
    assert np.array_equal(v_out + a_out, vocals + acc)


def test_buried_chorus_vocal_gets_a_bounded_measured_ride_and_verse_does_not():
    vocals, acc = _stems(accompaniment_boost_db=[(CHORUS, 5.0)])
    m = measure_vocal_relationship(vocals, acc, SR, SECTIONS)
    moves = plan_stem_moves(m, {})
    g = moves["section_vocal_gain_db"]
    assert 0.0 < g["chorus"] <= SECTION_MAX_GAIN_DB
    assert g["final_chorus"] == 0.0, "final chorus balance is normal: no ride"
    assert any("chorus" in r for r in moves["reasons"])


def test_no_section_moves_on_guessed_sections():
    vocals, acc = _stems(accompaniment_boost_db=[(CHORUS, 5.0)])
    guessed = {**SECTIONS, "method": "fallback_structure"}
    moves = plan_stem_moves(measure_vocal_relationship(vocals, acc, SR, guessed), {})
    assert not any(moves["section_vocal_gain_db"].values())


def test_masked_vocal_gets_arrangement_space_only_when_measured():
    vocals, acc = _stems()
    masked = plan_stem_moves(measure_vocal_relationship(vocals * 0.12, acc, SR, SECTIONS), {})
    assert masked["accompaniment_presence_cut_db"] < 0.0
    clear = plan_stem_moves(measure_vocal_relationship(vocals, acc, SR, SECTIONS), {})
    assert clear["accompaniment_presence_cut_db"] == 0.0


def test_uneven_vocal_is_levelled_and_keeps_its_balance():
    vocals, acc = _stems(vocal_spread_db=16.0)
    moves = plan_stem_moves(measure_vocal_relationship(vocals, acc, SR, SECTIONS), {})
    assert moves["vocal_compression_ratio"] > 1.0
    out, info = _process_vocal_stem(vocals, SR, moves)
    assert not info["unchanged"]
    rms = lambda x: float(np.sqrt(np.mean(x**2)))
    assert rms(out) == pytest.approx(rms(vocals), rel=0.05)


def test_no_fixed_reverb_or_chorus_constants_remain():
    import inspect

    import ai_mastering.mastering as mastering

    src = inspect.getsource(mastering)
    assert "Reverb(" not in src
    assert "0.30" not in src and "-26.0" not in src
