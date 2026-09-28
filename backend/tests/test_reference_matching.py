"""A reference track must actually pull the master toward its tonal
balance. It used to change nothing: the shifted target was absorbed by
the tolerance window and the blind confidence gates."""

import numpy as np
import pyloudnorm as pyln
import pytest
import soundfile as sf

from ai_mastering.band_levels import loudness_matched_band_deltas
from ai_mastering.mastering import master_track
from benchmark.metrics import compare
from synthetic import SR, make_mix

HIGH = ("presence_4000_6000hz", "high_6000_20000hz")
LOW = ("sub_bass_35_60hz", "kick_bass_60_120hz", "upper_bass_120_250hz")
SOURCE_KW = dict(seconds=16.0, seed=21, healthy_variation_db=0.5)


def _tilt(source, master):
    m = pyln.Meter(SR)
    d = loudness_matched_band_deltas(source, master, SR, m.integrated_loudness(source), m.integrated_loudness(master))
    return float(np.mean([d[b] for b in HIGH])), float(np.mean([d[b] for b in LOW]))


@pytest.fixture(scope="module")
def rendered(tmp_path_factory):
    d = tmp_path_factory.mktemp("ref")
    source = make_mix(**SOURCE_KW)
    sf.write(str(d / "src.wav"), source, SR)
    refs = {
        None: None,
        "matching": dict(healthy_variation_db=0.5),
        "bright": dict(offsets_db=[(3000, 20000, 6.0)]),
        "dark": dict(offsets_db=[(3000, 20000, -6.0)]),
        "bassy": dict(offsets_db=[(40, 250, 6.0)]),
    }
    out = {}
    for name, kw in refs.items():
        ref_path = None
        if kw is not None:
            ref_path = d / f"{name}_ref.wav"
            sf.write(str(ref_path), make_mix(seconds=16.0, seed=99, **kw), SR)
        master_path = d / f"{name}_master.wav"
        result = master_track(input_path=str(d / "src.wav"), output_path=str(master_path), genre="pop", tags=[], tweaks={}, style="modern", reference_track_path=str(ref_path) if ref_path else None)
        audio, _ = sf.read(str(master_path), dtype="float32")
        out[name] = {"tilt": _tilt(source, audio), "result": result, "flags": compare(source, audio, SR)["failures"]}
    return out


def test_matching_reference_changes_nothing(rendered):
    base, same = rendered[None]["tilt"], rendered["matching"]["tilt"]
    assert abs(same[0] - base[0]) < 0.3 and abs(same[1] - base[1]) < 0.3


def test_bright_reference_brightens_and_dark_reference_darkens(rendered):
    base_high = rendered[None]["tilt"][0]
    assert rendered["bright"]["tilt"][0] - base_high >= 1.0
    assert base_high - rendered["dark"]["tilt"][0] >= 1.0


def test_bass_heavy_reference_tilts_toward_the_low_end(rendered):
    base_high, base_low = rendered[None]["tilt"]
    high, low = rendered["bassy"]["tilt"]
    assert (low - high) - (base_low - base_high) >= 0.5


@pytest.mark.parametrize("name", ["bright", "dark", "bassy"])
def test_reference_moves_are_safe_and_attributed(rendered, name):
    result = rendered[name]["result"]
    assert result["quality_control"]["passed"]
    assert rendered[name]["flags"] == []
    problems = result["processing_applied"]["mastering_diagnostics"]["detected_problems"]
    assert any(p.get("reference_driven") for p in (problems.values() if isinstance(problems, dict) else problems))
