"""The benchmark's four failure detectors (lost drums, weaker bass, harsh
highs, pumping) must fire on deliberately damaged masters, stay quiet on
an untouched one — and the adaptive engine must not trip any of them on
the kinds of mixes where those failures were heard."""

import numpy as np
import pytest
import soundfile as sf
from scipy.signal import butter, sosfiltfilt

from ai_mastering.bus_processing import _true_peak_limiter
from ai_mastering.mastering import master_track
from benchmark.metrics import compare
from synthetic import SR, make_mix


@pytest.fixture(scope="module")
def drums_mix():
    return make_mix(seconds=16.0, seed=7, drum_level=1.2, healthy_variation_db=0.5)


def kinds(result):
    return {f["kind"] for f in result["failures"]}


def test_untouched_audio_has_no_failures(drums_mix):
    assert compare(drums_mix, drums_mix * 1.5, SR)["failures"] == []


def test_detects_pumping(drums_mix):
    sos = butter(2, [40, 120], btype="band", fs=SR, output="sos")
    env = np.abs(sosfiltfilt(sos, drums_mix.mean(axis=1)))
    env = np.convolve(env, np.ones(441) / 441, mode="same")
    duck = 1.0 - 0.6 * env / env.max()
    assert "pumping" in kinds(compare(drums_mix, drums_mix * duck[:, None], SR))


def test_detects_weaker_bass(drums_mix):
    sos = butter(4, 180, btype="high", fs=SR, output="sos")
    assert "weaker_bass" in kinds(compare(drums_mix, sosfiltfilt(sos, drums_mix, axis=0), SR))


def test_detects_harsh_highs(drums_mix):
    sos = butter(2, 4000, btype="high", fs=SR, output="sos")
    brighter = drums_mix + 1.2 * sosfiltfilt(sos, drums_mix, axis=0)
    assert "harsh_highs" in kinds(compare(drums_mix, brighter, SR))


def test_detects_lost_drums(drums_mix):
    crushed = _true_peak_limiter(drums_mix * 10 ** (18 / 20), SR, ceiling_db=-1.0)
    assert "lost_drums" in kinds(compare(drums_mix, crushed, SR))


@pytest.mark.parametrize(
    "name,kwargs,genre",
    [
        ("rock_drums", dict(drum_level=1.2, healthy_variation_db=0.5), "rock"),
        ("bass_heavy", dict(offsets_db=[(40, 250, 6.5)]), "hiphop"),
        ("bright", dict(offsets_db=[(2500, 9000, 6.5)]), "pop"),
        ("already_loud", dict(lufs=-9.0, limit_db=-6.0), "pop"),
    ],
)
def test_adaptive_master_has_none_of_the_heard_failures(tmp_path, name, kwargs, genre):
    source = make_mix(seconds=16.0, seed=11, **kwargs)
    src, out = tmp_path / "in.wav", tmp_path / "out.wav"
    sf.write(str(src), source, SR)
    master_track(input_path=str(src), output_path=str(out), genre=genre, tags=[], tweaks={}, style="modern")
    mastered, _ = sf.read(str(out), dtype="float32")
    result = compare(source, mastered, SR)
    assert result["failures"] == [], (name, result["failures"])
