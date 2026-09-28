"""Built-in presets are adaptive intents: they must reach the adaptive
engine with their loudness range and limits, not the literal chain
engine (which ignored their fields and delivered quiet masters)."""

import json
from pathlib import Path

import pyloudnorm as pyln
import pytest
import soundfile as sf

from ai_mastering.audio_utils import _true_peak_db
from ai_mastering.mastering import master_track
from ai_mastering.planning.preset_intent import compile_intent, is_intent_preset
from ai_mastering.planning.target_model import build_target_context
from app.services.mastering_service import resolve_mastering_config
from params import list_genres, list_styles
from synthetic import SR, make_mix

PRESETS = json.loads((Path(__file__).resolve().parents[1] / "mixing_presets.json").read_text())["presets"]
LITERAL_CHAIN = {"processing": {"eq": [{"frequency_hz": 100, "gain_db": 2.0, "q": 0.7}], "limiter": {"target_lufs_i": -12.0, "ceiling_dbtp": -1.0}}}


def test_every_builtin_preset_is_an_intent_and_a_literal_chain_is_not():
    assert all(is_intent_preset(p) for p in PRESETS.values())
    assert not is_intent_preset(LITERAL_CHAIN)


@pytest.mark.parametrize("slug", sorted(PRESETS))
def test_builtin_preset_routes_to_the_adaptive_engine_with_valid_genre(slug):
    config = resolve_mastering_config(genre=None, style="modern", tags=[], tweaks={}, use_stem_separation=False, output_format="wav", mix_preset=slug)
    assert config["full_preset"] is None and config["preset_intent"] is not None
    assert config["genre"] in list_genres() and config["style"] in list_styles()


def test_literal_chain_still_runs_on_the_manual_engine():
    config = resolve_mastering_config(genre="pop", style="modern", tags=[], tweaks={}, use_stem_separation=False, output_format="wav", mix_preset=None, preset_spec=LITERAL_CHAIN)
    assert config["full_preset"] is LITERAL_CHAIN and config["preset_intent"] is None


def test_preset_intent_sets_loudness_window_and_limits():
    preset = PRESETS["streaming_pop_glue"]
    intent = compile_intent(preset)
    assert intent["loudness"] == {"preferred": -10.5, "min": -12.5, "max": -9.0}
    profile_bands = [{"name": f"b{i}", "center_hz": hz} for i, hz in enumerate([40, 100, 250, 600, 1500, 3500, 8000, 14000])]
    ctx = build_target_context(profile_bands, "pop", preset_intent=preset)
    assert ctx.preferred_lufs == -10.5 and ctx.acceptable_min_lufs == -12.5 and ctx.acceptable_max_lufs == -9.0
    assert ctx.limiter_budget_cap_db == preset["processing"]["limiter"]["max_gain_reduction_db"]
    assert ctx.clipper_max_share_db == preset["processing"]["clipper"]["max_drive_db"]
    assert ctx.ceiling_dbtp == -2.0  # louder than -14 LUFS -> Spotify's -2 dBTP
    streaming = build_target_context(profile_bands, "pop", preset_intent=preset, delivery="streaming")
    assert streaming.preferred_lufs == -14.0 and streaming.acceptable_max_lufs <= -14.0 and streaming.ceiling_dbtp == -1.0


def test_preset_master_is_louder_than_the_source_not_quieter(tmp_path):
    src, out = tmp_path / "in.wav", tmp_path / "out.wav"
    source = make_mix(seconds=14.0, seed=9, lufs=-16.0)
    sf.write(str(src), source, SR)
    preset = PRESETS["streaming_pop_glue"]
    result = master_track(input_path=str(src), output_path=str(out), genre="pop", tags=[], tweaks={}, style="modern", preset_intent=preset)
    mastered, _ = sf.read(str(out), dtype="float32")
    meter = pyln.Meter(SR)
    assert meter.integrated_loudness(mastered) > meter.integrated_loudness(source) + 2.0
    assert _true_peak_db(mastered) <= -2.0 + 0.15
    assert result["target_profile_used"]["preset"] == "Streaming Pop Glue" or result["target_profile_used"]["preset"]
    assert result["quality_control"]["passed"]


def test_api_master_and_preview_route_intent_presets_and_delivery():
    """What Node sends: the resolved built-in preset as full_preset_json
    plus a delivery target."""
    import io

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api.routes.mastering import router
    app = FastAPI()
    app.include_router(router)

    buf = io.BytesIO()
    sf.write(buf, make_mix(seconds=10.0, seed=2, lufs=-16.0), SR, format="WAV")
    preset = {"name": "streaming_pop_glue", **PRESETS["streaming_pop_glue"]}
    client = TestClient(app)

    for delivery, ceiling in (("auto", -2.0), ("streaming", -1.0)):
        res = client.post(
            "/master",
            data={"genre": "pop", "full_preset_json": json.dumps(preset), "delivery": delivery, "category": "punch"},
            files={"file": ("mix.wav", buf.getvalue(), "audio/wav")},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["processing_applied"].get("chain_type") != "manual"  # adaptive, not the literal engine
        assert body["target_profile_used"]["delivery"] == delivery
        assert body["target_profile_used"]["true_peak_ceiling_dbtp"] == ceiling
        assert body["target_profile_used"]["category"] == "punch"  # objective chip still applies with a preset
        assert body["processing_applied"]["delivery_check"]["true_peak_dbtp"] <= ceiling + 0.15

    analysis = client.post("/analyze", files={"file": ("mix.wav", buf.getvalue(), "audio/wav")}).json()["analysis"]
    res = client.post("/preview-params", data={"analysis": json.dumps(analysis), "genre": "rock", "preset_json": json.dumps(preset), "delivery": "apple"})
    assert res.status_code == 200, res.text
