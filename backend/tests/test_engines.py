"""Standard vs Professional: what the engines share and where they differ.

The product copy (frontend homeFaq.js / i18n help.topic3, engines.py) says:
both engines make the same decisions; Professional differs only by giving
the sub and kick/bass their own compression bands, and only when the plan
compresses at all, so many masters are identical on both. These tests pin
that contract, so an engine change that makes the copy untrue fails here
instead of shipping a claim the product doesn't keep.
"""

from __future__ import annotations

import numpy as np
import pytest

from ai_mastering.analysis.profile import SourceProfile
from ai_mastering.audio_utils import _analysis_from_audio
from ai_mastering.diagnostics.problems import detect_mastering_problems
from ai_mastering.engines import ENGINES, PROFESSIONAL, STANDARD, get_engine
from ai_mastering.planning.plan import build_mastering_plan
from ai_mastering.planning.target_model import build_target_context
from ai_mastering.processing.render import render_plan

from synthetic import SR, make_mix

COMPRESSING = dict(lufs=-22.0, drum_level=2.0)  # edm: micro-dynamics need ~0.48
HEALTHY = dict(healthy_variation_db=1.0)


def _plans(kw, genre):
    audio = make_mix(seconds=10.0, seed=3, **kw)
    profile = SourceProfile.from_dict(_analysis_from_audio(audio, SR)["source_profile"])
    ctx = build_target_context(profile.band_layout, genre, [], "modern", None)
    problems = detect_mastering_problems(profile, ctx)
    return audio, {tier: build_mastering_plan(profile, ctx, problems, tier=tier) for tier in ENGINES}


@pytest.mark.parametrize("kw,genre", [(HEALTHY, "pop"), (COMPRESSING, "edm"), (dict(offsets_db=[(40, 250, 6.5)]), "hiphop")])
def test_both_engines_make_the_same_decisions(kw, genre):
    _, plans = _plans(kw, genre)
    std, pro = plans["standard"], plans["professional"]
    assert [d.to_dict() for d in std.eq_decisions] == [d.to_dict() for d in pro.eq_decisions]
    assert std.loudness == pro.loudness
    assert std.limiter == pro.limiter
    assert std.saturation == pro.saturation and std.stereo == pro.stereo and std.deesser == pro.deesser


def test_professional_splits_sub_and_punch_only_when_compressing():
    audio, plans = _plans(COMPRESSING, "edm")
    std, pro = plans["standard"], plans["professional"]
    assert std.compression["multiband"]["enabled"] and pro.compression["multiband"]["enabled"]
    assert set(std.compression["multiband"]["bands"]) == {"low", "low_mid", "high_mid", "high"}
    assert set(pro.compression["multiband"]["bands"]) == {"sub", "punch", "low_mid", "high_mid", "high"}
    a = render_plan(audio, SR, std, measure_stages=False)["audio"]
    b = render_plan(audio, SR, pro, measure_stages=False)["audio"]
    assert not np.array_equal(a, b), "with compression on, the engines must actually render differently"


def test_without_compression_both_engines_render_the_same_master():
    """The honest consequence of the contract: no extra processing is
    justified, so none is applied, and the masters match to float rounding."""
    audio, plans = _plans(HEALTHY, "pop")
    assert not plans["standard"].compression["enabled"]
    a = render_plan(audio, SR, plans["standard"], measure_stages=False)["audio"]
    b = render_plan(audio, SR, plans["professional"], measure_stages=False)["audio"]
    # Not bit-exact: the two bus functions trim the final ~0.01 dB of true
    # peak in slightly different code paths (measured: -149 dB residual,
    # max 6e-8, one float32 rounding step). -120 dB is far below audibility.
    residual_db = 20 * np.log10(np.sqrt(np.mean((a - b) ** 2)) / np.sqrt(np.mean(a**2)) + 1e-30)
    assert residual_db < -120.0, residual_db


def test_registry_and_fallback():
    assert get_engine("professional") is PROFESSIONAL
    assert get_engine(None) is STANDARD and get_engine("bogus") is STANDARD
    # Shared limiter: the only rendering difference is the compression split.
    assert STANDARD.limiter.startswith("ramped-attack") and "shared with Standard" in PROFESSIONAL.limiter
