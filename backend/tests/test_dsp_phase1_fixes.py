"""Regression tests for the DSP Phase 1 fixes (docs/agent-reports/DSP_FIXES.md).
Each test names the defect it pins and failed on the tree before its fix."""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from ai_mastering.analysis.profile import SourceProfile
from ai_mastering.audio_utils import _analysis_from_audio
from ai_mastering.diagnostics.problems import detect_mastering_problems
from ai_mastering.evaluation.backoff import _lower_loudness
from ai_mastering.planning.plan import apply_user_tweaks_to_plan, build_mastering_plan
from ai_mastering.planning.target_model import build_target_context

from synthetic import SR, make_mix

FIXTURES = {
    "healthy": dict(healthy_variation_db=1.0),
    "rock_transient": dict(drum_level=1.2, healthy_variation_db=0.5),
    "no_infra_sub": dict(offsets_db=[(20, 30, -12.0)]),
    "thin": dict(offsets_db=[(40, 300, -7.0)]),
}


@lru_cache(maxsize=None)
def _profile(name: str) -> SourceProfile:
    return SourceProfile.from_dict(_analysis_from_audio(make_mix(seconds=10.0, seed=7, **FIXTURES[name]), SR)["source_profile"])


def _plan(name: str, genre: str, tags=(), category=None, flavour=None, delivery=None, preset_intent=None):
    profile = _profile(name)
    ctx = build_target_context(profile.band_layout, genre, list(tags), "modern", category, flavour, preset_intent=preset_intent, delivery=delivery)
    problems = detect_mastering_problems(profile, ctx)
    return ctx, build_mastering_plan(profile, ctx, problems)


# --- C1 / AURALITH-AUDIO-008: true-peak ceiling follows the planned loudness ----------------


def test_quiet_planned_master_gets_minus_1_dbtp_and_the_same_target():
    ctx, plan = _plan("rock_transient", "rock")
    # Rock's window reaches above -14 LUFS, so the context says -2 dBTP ...
    assert ctx.ceiling_dbtp == -2.0
    # ... but this transient-heavy source is planned below -14 LUFS (crest cap),
    # where -1 dBTP is the delivery rule.
    assert plan.loudness["target_lufs"] <= -14.0
    assert plan.limiter["ceiling_dbtp"] == -1.0
    # The target is NOT recomputed with the extra headroom: it is the value the
    # -2 dBTP budget gave (freed headroom = less limiting, not more loudness).
    lufs, p995 = _profile("rock_transient").integrated_lufs, _profile("rock_transient").peak_p995_db
    achievable_at_context_ceiling = lufs + ctx.ceiling_dbtp + plan.limiter["budget_db"] - p995
    assert abs(plan.loudness["target_lufs"] - round(min(plan.loudness["desired_lufs"], achievable_at_context_ceiling), 2)) < 0.011


def test_loud_planned_master_keeps_minus_2_dbtp():
    _, plan = _plan("healthy", "pop")
    assert plan.loudness["target_lufs"] > -14.0
    assert plan.limiter["ceiling_dbtp"] == -2.0


def test_ceiling_is_rederived_after_loudness_tweak_and_backoff():
    _, plan = _plan("rock_transient", "rock")
    assert plan.limiter["ceiling_dbtp"] == -1.0
    # A loudness tweak that lifts the target above -14 LUFS restores -2 dBTP.
    loud = plan.copy()
    loud.loudness["achievable_lufs_by_budget"] = -12.0
    loud.loudness["desired_lufs"] = -12.0
    apply_user_tweaks_to_plan(loud, {"loudness": 1.0})
    assert loud.loudness["target_lufs"] > -14.0 and loud.limiter["ceiling_dbtp"] == -2.0
    # Backoff lowering a loud plan below -14 LUFS relaxes it to -1 dBTP.
    _, hp = _plan("healthy", "pop")
    hp.loudness["target_lufs"] = -13.8
    _lower_loudness(hp, 1.0, [], "test")
    assert hp.loudness["target_lufs"] <= -14.0 and hp.limiter["ceiling_dbtp"] == -1.0


def test_quiet_genre_window_ceiling_is_never_tightened():
    ctx, plan = _plan("healthy", "pop", delivery="streaming")
    assert ctx.ceiling_dbtp == -1.0 and plan.limiter["ceiling_dbtp"] == -1.0


# --- C2 / AURALITH-AUDIO-001: transient checks in relative units ---------------------------


def test_guardrail_transient_limit_is_a_fraction_of_source_punch():
    """src 0.50 -> 0.42 is an absolute delta of -0.08 but a 16 % loss: it must
    fail the documented 12 % guardrail (it passed when the absolute delta was
    compared with the fraction)."""
    from ai_mastering.evaluation.evaluate import transient_relative_delta
    from ai_mastering.output_validation import validate_render

    rel = transient_relative_delta(0.50, 0.42)
    assert abs(rel + 0.16) < 1e-9
    zero = {b: 0.0 for b in ("subsonic_20_35hz", "sub_bass_35_60hz", "kick_bass_60_120hz", "upper_bass_120_250hz", "low_mid_250_500hz", "mid_500_2000hz", "high_mid_2000_4000hz", "presence_4000_6000hz", "high_6000_20000hz")}
    r = validate_render(band_deltas_db=zero, true_peak_dbtp=-1.2, rendered_lufs=-10.0, target_lufs=-10.0, transient_delta=rel)
    assert any(f.name == "transient_loss" for f in r.failures)
    # Exemption for sources with almost no punch stays.
    assert transient_relative_delta(0.10, 0.02) == 0.0


def test_evaluator_transient_check_uses_relative_loss(tmp_path):
    """End-to-end on the engine's own evaluation: the reported relative_delta
    is (master - source) / source and is what passes/fails the check."""
    import soundfile as sf

    from ai_mastering.mastering import master_track

    src = tmp_path / "in.wav"
    sf.write(str(src), make_mix(seconds=8.0, seed=3, drum_level=1.2), SR)
    r = master_track(str(src), str(tmp_path / "out.wav"), "pop", [])
    t = r["mastering_diagnostics"]["evaluation"]["transients"]
    expected = (t["master_transient_score"] - t["source_transient_score"]) / t["source_transient_score"]
    assert abs(t["relative_delta"] - expected) < 2e-3
    assert t["passed"] == (t["relative_delta"] >= -t["allowed_loss"])


# --- C3 / AURALITH-AUDIO-010: no automatic boost for a deficit entirely below 40 Hz ----------


def test_deficit_only_below_40hz_is_not_boosted():
    _, plan = _plan("no_infra_sub", "pop")
    assert "insufficient_sub" in plan.detected_problems
    assert not [d for d in plan.eq_decisions if d.gain_db > 0 and d.frequency_hz < 60.0]
    assert any(r["stage"] == "eq" and "high-pass" in r["reason"] for r in plan.rejected_decisions)


def test_bass_deficit_reaching_above_40hz_is_still_corrected():
    _, plan = _plan("thin", "edm")
    assert any(d.gain_db > 0 and d.frequency_hz < 300.0 for d in plan.eq_decisions)


# --- C4 / AURALITH-AUDIO-002: polarity-inverted stereo is corrected at input ----------------


def test_polarity_inverted_stereo_is_corrected_and_delivered(tmp_path):
    import soundfile as sf

    from ai_mastering.mastering import master_track

    x = make_mix(seconds=8.0, seed=9)
    inverted = np.stack([x[:, 0], -x[:, 1]], axis=1).astype(np.float32)
    src = tmp_path / "inv.wav"
    sf.write(str(src), inverted, SR)
    r = master_track(str(src), str(tmp_path / "out.wav"), "pop", [])  # used to raise InvalidAudioError
    iv = r["processing_applied"]["input_validation"]
    assert iv["polarity_corrected"] == "right" and iv["input_stereo_correlation"] < -0.5
    assert r["analysis_after"]["stereo_correlation"] > 0.5
    codes = [w["code"] for w in r["processing_applied"]["source_warning_codes"]]
    assert "polarity_corrected" in codes
    assert any("opposite polarity" in w for w in r["source_warnings"])


def test_normal_stereo_input_is_bit_exact():
    from ai_mastering.quality_control import validate_input_signal

    x = make_mix(seconds=4.0, seed=11).astype(np.float32)
    out = validate_input_signal(x.copy(), SR)
    assert out["polarity_corrected"] is None
    assert np.array_equal(out["_corrected_audio"], x)


# --- C5 / AURALITH-AUDIO-007: saturation only on explicit colour intent ---------------------


def test_genre_default_no_longer_enables_saturation():
    _, plan = _plan("thin", "edm")  # enabled by the edm base_saturation before the fix
    assert not plan.saturation["enabled"]
    assert any(r["stage"] == "saturation" and "no colour requested" in r["reason"] for r in plan.rejected_decisions)


def test_explicit_colour_intent_still_enables_saturation():
    _, tagged = _plan("thin", "edm", tags=["warmer"])
    assert tagged.saturation["enabled"] and tagged.saturation["drive_db"] > 0
    _, warm = _plan("thin", "edm", category="warm")
    assert warm.saturation["enabled"]
    _, plain = _plan("thin", "edm")
    slider = plain.copy()
    apply_user_tweaks_to_plan(slider, {"warmth": 0.5})
    assert slider.saturation["enabled"] and slider.saturation["requested_by"] == ["warmth slider"]


def test_colour_preset_requests_saturation_and_a_neutral_preset_does_not():
    import json
    from pathlib import Path

    presets = json.loads((Path(__file__).resolve().parents[1] / "mixing_presets.json").read_text())["presets"]
    profile = _profile("thin")
    lofi = build_target_context(profile.band_layout, "edm", [], "modern", preset_intent=presets["lofi_vinyl_haze"])
    glue = build_target_context(profile.band_layout, "edm", [], "modern", preset_intent=presets["streaming_pop_glue"])
    assert lofi.saturation_requested and not glue.saturation_requested


def test_saturation_amount_does_not_depend_on_eq_change_budget():
    from ai_mastering.planning.plan import _plan_saturation

    profile = _profile("thin")
    ctx = build_target_context(profile.band_layout, "edm", ["warmer"], "modern")
    small = _plan_saturation(profile, ctx, {"change_budget": 0.1}, [])
    large = _plan_saturation(profile, ctx, {"change_budget": 0.9}, [])
    assert small["amount"] == large["amount"] and small["enabled"]
