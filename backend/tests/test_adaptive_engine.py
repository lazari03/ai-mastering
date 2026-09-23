"""Behavioural tests for the plan-driven adaptive mastering engine.

Fixtures are synthetic mixes (tests/synthetic.py) whose tonal state is
calibrated with the engine's own analysis, so every expectation is about
DECISIONS DERIVED FROM MEASUREMENTS: change the measured spectrum and the
plan must change accordingly; leave it healthy and the plan must stay
(nearly) empty — independent of genre.
"""

from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pytest
import soundfile as sf

from ai_mastering.analysis.profile import SourceProfile
from ai_mastering.analysis.spectral import analyze_spectrum, hires_bands
from ai_mastering.audio_utils import _analysis_from_audio
from ai_mastering.bus_processing import _bus_process
from ai_mastering.diagnostics.problems import detect_mastering_problems
from ai_mastering.dsp_filters import _split_bands, _split_bands_pro
from ai_mastering.evaluation.backoff import derive_backoff_plan
from ai_mastering.mastering import analyze_for_preview, master_track, preview_processing_params
from ai_mastering.planning import config as C
from ai_mastering.planning.plan import build_mastering_plan
from ai_mastering.planning.target_model import build_target_context
from ai_mastering.processing.eq import band_response_db

from synthetic import SR, make_mix

# Named fixtures: (make_mix kwargs). Offsets are (lo_hz, hi_hz, dB) relative
# to the neutral curve.
FIXTURES = {
    "healthy": dict(healthy_variation_db=1.0),
    "bass_heavy": dict(offsets_db=[(40, 250, 6.5)]),
    "thin": dict(offsets_db=[(40, 300, -7.0)]),
    "dark": dict(offsets_db=[(3000, 20000, -7.5)]),
    "slightly_dark": dict(offsets_db=[(3000, 20000, -3.5)]),
    "bright_harsh": dict(offsets_db=[(2500, 9000, 6.5)]),
    "rock_transient": dict(drum_level=1.2, healthy_variation_db=0.5),
    "already_limited": dict(lufs=-9.0, limit_db=-6.0),
    "healthy_master": dict(lufs=-10.5, limit_db=-4.0, healthy_variation_db=0.8),
    "wide_low": dict(low_end_width=0.6),
    # The reported failure mode: healthy sub/deep bass, excessive upper
    # bass / low mids, already-strong 6-10 kHz, slightly deficient air.
    "regression": dict(offsets_db=[(140, 450, 6.0), (5500, 10000, 4.0), (14000, 20000, -5.0)]),
}


@lru_cache(maxsize=None)
def mix(name: str, seed: int = 0) -> np.ndarray:
    return make_mix(seconds=20.0, seed=seed, **FIXTURES[name])


@lru_cache(maxsize=None)
def analysis(name: str) -> dict:
    return _analysis_from_audio(mix(name), SR)


def plan_for(name: str, genre: str = "pop", tier: str = "standard", tags=(), style: str = "modern", category=None):
    profile = SourceProfile.from_dict(analysis(name)["source_profile"])
    ctx = build_target_context(profile.band_layout, genre, list(tags), style, category)
    problems = detect_mastering_problems(profile, ctx)
    return profile, ctx, problems, build_mastering_plan(profile, ctx, problems, tier=tier)


_RENDER_CACHE: dict = {}


def render(name: str, tmp_path_factory, genre: str = "pop", tier: str = "standard") -> dict:
    key = (name, genre, tier)
    if key not in _RENDER_CACHE:
        d = tmp_path_factory.mktemp(f"r_{name}_{genre}_{tier}")
        src = d / "in.wav"
        sf.write(str(src), mix(name), SR)
        result = master_track(str(src), str(d / "out.wav"), genre, [], tier=tier)
        result["_out"], _ = sf.read(str(d / "out.wav"), dtype="float32", always_2d=True)
        _RENDER_CACHE[key] = result
    return _RENDER_CACHE[key]


def auto_eq(plan):
    return [d for d in plan.eq_decisions if d.source == "automatic"]


def response(plan, lo: float, hi: float) -> list[float]:
    resp = band_response_db(plan.eq_decisions, plan.band_layout, plan.sample_rate)
    return [resp[b["name"]] for b in plan.band_layout if lo <= b["center_hz"] < hi]


# ---------------------------------------------------------------------------
# Measurement layer
# ---------------------------------------------------------------------------


def test_hires_bands_respect_nyquist():
    low_sr = hires_bands(22050)
    assert low_sr[-1]["hi"] < 11025.0
    assert all(b["lo"] < 11025.0 for b in low_sr)
    assert len(hires_bands(44100)) >= 20  # ~20-30 bands as specified


def test_pink_noise_reads_flat():
    rng = np.random.default_rng(3)
    n = SR * 20
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[1:] /= np.sqrt(f[1:])
    spec[0] = 0
    pink = np.fft.irfft(spec, n).astype(np.float32)
    pink /= np.abs(pink).max() * 2
    rel = analyze_spectrum(np.stack([pink, pink], 1), SR)["relative_db"]
    assert max(abs(v) for k, v in rel.items() if not k.startswith(("20_", "30_"))) < 1.5


def test_source_profile_json_round_trip():
    raw = analysis("healthy")["source_profile"]
    restored = SourceProfile.from_dict(json.loads(json.dumps(raw)))
    assert restored.to_dict() == SourceProfile.from_dict(raw).to_dict()
    assert restored.spectral_bands and restored.segment_percentiles


def test_legacy_band_split_reconstructs_exactly():
    x = np.random.default_rng(1).standard_normal(SR * 3).astype(np.float32)
    for fn in (_split_bands, _split_bands_pro):
        assert np.max(np.abs(sum(fn(x, SR).values()) - x)) < 1e-5


def test_standard_bus_does_not_compress_below_ceiling():
    """The standard tier used pedalboard.Limiter, whose hidden 4:1 stage
    at -10 dBFS removed ~4 dB of kick energy on material never touching
    the ceiling. The bus must now be gain + a gain-only peak limiter."""
    x = mix("healthy") * 0.5
    out, _gain_db, _guard, report = _bus_process(x, SR, {"target_lufs": -30.0, "clipper_enabled": False}, apply_glue_compression=False)
    before = analyze_spectrum(x, SR)["level_db"]
    after = analyze_spectrum(out, SR)["level_db"]
    deltas = [after[k] - before[k] for k in ("55_70hz", "70_90hz", "90_120hz", "1000_1400hz", "5500_7500hz")]
    assert max(deltas) - min(deltas) < 0.3  # pure gain, no tonal change
    assert report["limiter_gain_reduction_db"] < 0.05


# ---------------------------------------------------------------------------
# Planning: decisions come from measured problems
# ---------------------------------------------------------------------------


def test_healthy_source_gets_near_empty_plan():
    _, _, problems, plan = plan_for("healthy")
    assert auto_eq(plan) == []
    assert not plan.dynamic_eq_decisions
    assert not plan.compression["enabled"]
    assert not plan.saturation["enabled"]
    assert not plan.stereo["enabled"]
    assert not plan.deesser["enabled"]
    assert not plan.clipper["enabled"]
    assert plan.change_budget["change_budget"] <= 0.2
    assert not [p for p in problems if p.category == "tonal" and p.actionable and p.confidence >= C.REQUIRED_CONFIDENCE["cut"]]


def test_bass_heavy_gets_bass_cut_without_hf_boost():
    _, _, _, plan = plan_for("bass_heavy")
    eq = auto_eq(plan)
    assert eq and all(d.gain_db < 0 and d.frequency_hz < 300 for d in eq)
    assert max(response(plan, 2000, 20000)) <= 0.1


def test_thin_source_gets_low_support_not_brightness():
    _, _, _, plan = plan_for("thin")
    boosts = [d for d in auto_eq(plan) if d.gain_db > 0]
    assert boosts and all(d.frequency_hz < 500 for d in boosts)
    assert all(d.gain_db <= C.EQ_MAX_BOOST_DB["low"] + 1e-6 for d in boosts)
    assert max(response(plan, 4000, 20000)) <= 0.1


def test_dark_source_gets_confident_bounded_hf_correction():
    _, _, problems, plan = plan_for("dark")
    hf = [d for d in auto_eq(plan) if d.gain_db > 0 and d.frequency_hz >= 2000]
    assert hf, "a clearly dark source should receive an HF correction"
    assert all(d.confidence >= C.REQUIRED_CONFIDENCE["boost_high"] for d in hf)
    assert max(response(plan, C.HF_BUDGET_START_HZ, 20000)) <= C.HF_BOOST_BUDGET_DB * 1.4 + 1e-6


def test_slightly_dark_source_is_left_alone():
    """Boosting HF needs strong evidence: a mild deficit inside the
    tolerance window must not produce a boost."""
    _, _, _, plan = plan_for("slightly_dark")
    assert not [d for d in auto_eq(plan) if d.gain_db > 0 and d.frequency_hz >= 2000]


def test_bright_harsh_source_gets_no_hf_boost():
    profile, _, _, plan = plan_for("bright_harsh")
    assert max(response(plan, 2000, 20000)) <= 0.05
    assert any(d.gain_db < 0 and 2000 <= d.frequency_hz <= 10000 for d in auto_eq(plan))
    assert not plan.saturation["enabled"]  # harmonics would add more HF


def test_boosts_need_more_confidence_than_cuts():
    """Same-sized deviation, opposite sign: the excess is corrected, the
    deficit of equal size in the same region is not (asymmetric gates)."""
    base = dict(seconds=20.0, seed=5)
    up = SourceProfile.from_dict(_analysis_from_audio(make_mix(offsets_db=[(3000, 20000, 5.0)], **base), SR)["source_profile"])
    down = SourceProfile.from_dict(_analysis_from_audio(make_mix(offsets_db=[(3000, 20000, -5.0)], **base), SR)["source_profile"])
    results = {}
    for name, prof in (("up", up), ("down", down)):
        ctx = build_target_context(prof.band_layout, "pop", [], "modern")
        plan = build_mastering_plan(prof, ctx, detect_mastering_problems(prof, ctx))
        results[name] = auto_eq(plan)
    assert any(d.gain_db < 0 for d in results["up"])
    assert not any(d.gain_db > 0 for d in results["down"])


def test_every_automatic_decision_is_backed_by_a_measured_problem():
    """Unknown audio: randomised spectra. Each automatic EQ move must point
    at a detected problem, oppose its measured deviation, and have cleared
    that problem's confidence gate."""
    rng = np.random.default_rng(11)
    for seed in range(4):
        offsets = []
        for _ in range(2):
            lo = float(np.exp(rng.uniform(np.log(40), np.log(9000))))
            offsets.append((lo, lo * float(rng.uniform(1.5, 4.0)), float(rng.uniform(-8, 8))))
        prof = SourceProfile.from_dict(_analysis_from_audio(make_mix(seconds=16.0, seed=seed + 20, offsets_db=offsets), SR)["source_profile"])
        ctx = build_target_context(prof.band_layout, "pop", [], "modern")
        problems = {p.kind: p for p in detect_mastering_problems(prof, ctx)}
        plan = build_mastering_plan(prof, ctx, list(problems.values()))
        for d in auto_eq(plan):
            p = problems[d.problem]
            assert np.sign(d.gain_db) == -np.sign(p.measured_deviation_db), (offsets, d)
            gate = C.REQUIRED_CONFIDENCE["cut"] if d.gain_db < 0 else C.REQUIRED_CONFIDENCE[{"low": "boost_low", "mid": "boost_mid", "high": "boost_high"}[p.frequency_class]]
            assert p.confidence >= gate


def test_same_source_two_genres_no_genre_invented_processing():
    """Genre changes the acceptable destination (loudness range, tonal
    window), never adds fixed processing on its own."""
    _, ctx_pop, _, pop = plan_for("healthy", genre="pop")
    _, ctx_rock, _, rock = plan_for("healthy", genre="rock")
    _, _, _, hiphop = plan_for("healthy", genre="hiphop")
    assert auto_eq(pop) == [] and auto_eq(rock) == [] and auto_eq(hiphop) == []
    assert (ctx_pop.acceptable_min_lufs, ctx_pop.acceptable_max_lufs) != (ctx_rock.acceptable_min_lufs, ctx_rock.acceptable_max_lufs)
    assert not rock.saturation["enabled"] and not pop.saturation["enabled"]


def test_category_bias_cannot_force_a_boost_on_a_bright_source():
    _, _, _, plan = plan_for("bright_harsh", category="bright")
    assert max(response(plan, 2000, 20000)) <= 0.05


def test_compression_is_optional_and_off_when_not_needed():
    for name in ("healthy", "rock_transient", "already_limited"):
        _, _, _, plan = plan_for(name)
        assert plan.compression["enabled"] is False
        assert plan.compression["multiband"] == {"enabled": False}
        assert any(r["stage"] == "compression" for r in plan.rejected_decisions)


def test_release_uses_tempo_only_when_reliable():
    profile, ctx, problems, _ = plan_for("rock_transient")
    from ai_mastering.planning.plan import _release_ms

    profile.tempo_bpm, profile.bpm_confidence = 120.0, 0.9
    confident, basis = _release_ms(profile, [])
    assert "tempo" in basis and C.COMPRESSOR_RELEASE_RANGE_MS[0] <= confident <= C.COMPRESSOR_RELEASE_RANGE_MS[1]
    profile.bpm_confidence = 0.1
    _, basis = _release_ms(profile, [])
    assert "no reliable tempo" in basis


def test_already_limited_source_gets_no_extra_loudness_pressure():
    profile, _, _, plan = plan_for("already_limited")
    assert profile.already_limited_score > 0.5
    assert plan.loudness["target_lufs"] <= profile.integrated_lufs + 0.5
    assert not plan.clipper["enabled"] and not plan.saturation["enabled"]
    assert plan.limiter["budget_db"] < C.LIMITER_BUDGET_MAX_DB * 0.5


def test_wide_low_end_gets_lf_mono_only():
    profile, _, _, plan = plan_for("wide_low")
    assert plan.stereo["lf_mono"]["enabled"]
    assert plan.stereo["side_gain_db"] == 0.0 and plan.stereo["side_high_shelf_db"] == 0.0


def test_plan_is_json_serialisable_and_explains_itself():
    _, _, _, plan = plan_for("regression")
    d = json.loads(json.dumps(plan.to_dict()))
    for e in d["eq_decisions"]:
        assert e["reason"] and 0.0 <= e["confidence"] <= 1.0
    assert all(r["reason"] for r in d["rejected_decisions"])
    assert "compression" in d and "reason" in json.dumps(d["compression"]) or not d["compression"]["enabled"]


def test_preview_matches_engine_and_is_json_safe(tmp_path):
    p = tmp_path / "in.wav"
    sf.write(str(p), mix("regression"), SR)
    pv = json.loads(json.dumps(analyze_for_preview(str(p))))
    params = preview_processing_params(pv["analysis"], "pop", [], "modern", {"brightness": 0.5})
    json.dumps(params)
    assert not any(k.startswith("_") for k in params)
    assert set(params["per_band_gain_changes_db"]) == {
        "sub_bass_20_60hz", "bass_60_250hz", "low_mid_250_500hz", "mid_500_2000hz",
        "high_mid_2000_4000hz", "presence_4000_6000hz", "brilliance_6000_20000hz",
    }
    user = [e for e in params["mastering_plan"]["eq_decisions"] if e["source"] == "user_tweak"]
    assert user and user[0]["confidence"] == 1.0


# ---------------------------------------------------------------------------
# Regression: "highs get amplified while bass gets lost"
# ---------------------------------------------------------------------------


def test_regression_plan_targets_upper_bass_and_never_boosts_strong_highs():
    profile, _, problems, plan = plan_for("regression")
    eq = auto_eq(plan)
    cuts = [d for d in eq if d.gain_db < 0]
    assert cuts and all(120 <= d.frequency_hz <= 550 for d in cuts)
    # No broad bass cut: the healthy kick/sub region is protected.
    assert min(response(plan, 40, 120)) >= -C.EQ_MAX_LOW_END_COLLATERAL_DB - 0.05
    # No boost reaching the already-strong 5.5-10 kHz region.
    assert max(response(plan, 5500, 10000)) <= 0.1
    # Any air boost must be a confident, top-only shelf.
    for d in eq:
        if d.gain_db > 0:
            assert d.frequency_hz >= 12000 and d.confidence >= C.REQUIRED_CONFIDENCE["boost_high"]


@pytest.mark.parametrize("tier", ["standard", "professional"])
def test_regression_render_preserves_low_end_and_does_not_brighten(tmp_path_factory, tier):
    result = render("regression", tmp_path_factory, tier=tier)
    ev = result["mastering_diagnostics"]["evaluation"]
    regions = ev["regions"]
    assert regions["low_end_40_120"]["actual_db"] >= -1.0, regions
    assert regions["hf_4k_14k"]["actual_db"] <= 0.5, regions
    assert abs(regions["low_end_40_120"]["collateral_db"]) <= C.LOW_END_COLLATERAL_TOLERANCE_DB
    assert abs(regions["hf_4k_14k"]["collateral_db"]) <= C.HF_COLLATERAL_TOLERANCE_DB
    assert result["analysis_after"]["true_peak_db"] <= C.LIMITER_CEILING_DBTP + 0.15


# ---------------------------------------------------------------------------
# Full renders: evaluation, safety, bounded backoff
# ---------------------------------------------------------------------------


def test_healthy_master_render_is_near_no_op(tmp_path_factory):
    result = render("healthy_master", tmp_path_factory)
    diag = result["mastering_diagnostics"]
    plan = diag["mastering_plan"]
    assert [e for e in plan["eq_decisions"] if e["source"] == "automatic"] == []
    assert abs(result["analysis_after"]["integrated_lufs"] - result["analysis_before"]["integrated_lufs"]) <= 1.0
    changes = [v for k, v in diag["evaluation"]["band_change_db"].items() if not k.startswith(("20_", "18000"))]
    assert max(abs(v) for v in changes) < 0.75


def test_rock_render_preserves_transients(tmp_path_factory):
    result = render("rock_transient", tmp_path_factory, genre="rock", tier="professional")
    diag = result["mastering_diagnostics"]
    ev = diag["evaluation"]
    assert ev["transients"]["passed"], ev["transients"]
    assert not diag["mastering_plan"]["clipper"]["enabled"]
    assert ev["limiter"]["gr_at_p995_peaks_db"] <= ev["limiter"]["budget_db"] + C.LIMITER_BUDGET_OVERSHOOT_TOLERANCE_DB


def test_wide_low_render_monos_bass_but_keeps_image(tmp_path_factory):
    result = render("wide_low", tmp_path_factory)
    before = result["mastering_diagnostics"]["source_profile"]["stereo_regions"]
    after = result["analysis_after"]["source_profile"]["stereo_regions"]
    assert after["low_20_120hz"]["width"] < 0.2
    for region in ("mid_500_2000hz", "high_mid_2000_6000hz"):
        assert after[region]["width"] == pytest.approx(before[region]["width"], rel=0.2)


@pytest.mark.parametrize("name", ["healthy", "bass_heavy", "bright_harsh", "already_limited"])
def test_output_safety(tmp_path_factory, name):
    result = render(name, tmp_path_factory)
    out = result["_out"]
    assert np.all(np.isfinite(out))
    assert np.max(np.abs(out)) < 1.0
    assert result["analysis_after"]["true_peak_db"] <= C.LIMITER_CEILING_DBTP + 0.15
    assert result["analysis_after"]["stereo_correlation"] > C.SAFE_MIN_CORRELATION
    diag = result["mastering_diagnostics"]
    assert diag["renders"] <= 1 + C.MAX_BACKOFF_RENDERS
    json.dumps({k: v for k, v in result.items() if k != "_out"})  # whole result stays serialisable


def test_evaluation_catches_collateral_and_backoff_reduces_the_culprit(tmp_path_factory):
    """Force a stage the plan would never choose (heavy saturation on a
    source) and check the evaluator notices unplanned change, blames the
    right stage, and the single backoff removes it."""
    from ai_mastering.evaluation.evaluate import evaluate_master
    from ai_mastering.processing.render import render_plan

    profile, ctx, _, plan = plan_for("healthy")
    plan.saturation = {"enabled": True, "amount": 0.25, "drive_db": 18.0, "side_drive_scale": 1.0}
    out = render_plan(mix("healthy"), SR, plan)
    after = _analysis_from_audio(out["audio"], SR)
    ev = evaluate_master(profile, SourceProfile.from_dict(after["source_profile"]), after, analysis("healthy"), out["audio"], SR, plan, ctx, out)
    sat_flags = [f for f in ev.flags if f["blamed_stage"] == "saturation"]
    assert sat_flags, ev.flags
    backoff, actions = derive_backoff_plan(plan, ev)
    assert backoff is not None and not backoff.saturation["enabled"]
    assert backoff.backoff["actions"] == actions


def test_backoff_is_none_without_significant_flags():
    _, _, _, plan = plan_for("healthy")

    class _Eval:
        flags = [{"kind": "hf_growth", "severity": 0.1, "blamed_stage": "eq", "measured": 1.1, "limit": 1.0, "detail": "tiny"}]

    assert derive_backoff_plan(plan, _Eval()) == (None, [])
