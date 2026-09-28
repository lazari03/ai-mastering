"""Manual (full-preset) chains are held to the adaptive engine's delivery
safety limits, and a chain that fails final QC never produces a file."""

import numpy as np
import pytest
import soundfile as sf

import app.services.preset_dsp_engine as engine
from ai_mastering.audio_utils import _true_peak_db
from ai_mastering.planning import config as C
from ai_mastering.quality_control import InvalidAudioError
from synthetic import SR, make_mix


@pytest.fixture(scope="module")
def source(tmp_path_factory):
    path = tmp_path_factory.mktemp("preset") / "in.wav"
    sf.write(str(path), make_mix(seconds=12.0, seed=3), SR)
    return path


HOSTILE = {
    "input": {"auto_gain": True, "headroom_target_db": 0.0},
    "eq": [{"frequency_hz": 60, "gain_db": 18.0, "q": 0.7}, {"frequency_hz": 9000, "gain_db": 15.0, "q": 0.7}],
    "bus_compressor": {"ratio": 20.0, "attack_ms": 1, "release_ms": 50, "max_gain_reduction_db": 20.0},
    "saturation": {"enabled": True, "amount": 0.4, "oversampling": 4},
    "clipper": {"enabled": True, "ceiling_dbtp": 0.0, "drive_db": 12.0, "oversampling": 4},
    "limiter": {"target_lufs_i": -3.0, "ceiling_dbtp": 0.0},
}


def test_enforce_safety_limits_clamps_and_reports():
    safe, ceiling, adjustments = engine.enforce_safety_limits(HOSTILE, {"true_peak_ceiling_dbtp": 0.0})
    assert ceiling == C.LIMITER_CEILING_DBTP
    assert safe["limiter"]["ceiling_dbtp"] <= C.LIMITER_CEILING_DBTP
    assert safe["limiter"]["target_lufs_i"] <= engine.MANUAL_MAX_TARGET_LUFS
    assert safe["clipper"]["drive_db"] <= C.CLIPPER_MAX_SHARE_DB
    assert all(abs(b["gain_db"]) <= engine.MANUAL_EQ_MAX_DB for b in safe["eq"])
    assert safe["bus_compressor"]["ratio"] <= engine.MANUAL_COMPRESSOR_MAX_RATIO
    assert safe["saturation"]["amount"] * 60.0 <= C.SATURATION_MAX_DRIVE_DB + 1e-9
    assert len(adjustments) >= 8
    # The caller's preset is never mutated.
    assert HOSTILE["eq"][0]["gain_db"] == 18.0


def test_hostile_chain_is_delivered_only_within_safety_limits(source, tmp_path):
    out = tmp_path / "out.wav"
    result = engine.render_preset_master(str(source), str(out), {"processing": HOSTILE})
    audio, _ = sf.read(str(out))
    assert result["quality_control"]["passed"]
    assert _true_peak_db(audio) <= C.LIMITER_CEILING_DBTP + 0.15
    lim = result["processing_applied"]["limiter"]
    assert lim["gr_at_p995_peaks_db"] <= C.LIMITER_BUDGET_MAX_DB + C.LIMITER_BUDGET_OVERSHOOT_TOLERANCE_DB
    assert result["processing_applied"]["chain_type"] == "manual"
    assert result["processing_applied"]["safety_adjustments"]


def test_chain_without_limiter_still_gets_the_ceiling(source, tmp_path):
    out = tmp_path / "out.wav"
    chain = {"input": {"auto_gain": True, "headroom_target_db": -1.0}, "eq": [{"frequency_hz": 100, "gain_db": 6.0, "q": 0.7}]}
    result = engine.render_preset_master(str(source), str(out), {"processing": chain})
    audio, _ = sf.read(str(out))
    assert _true_peak_db(audio) <= C.LIMITER_CEILING_DBTP + 0.15
    assert any("safety limiter" in a for a in result["processing_applied"]["safety_adjustments"])


def _failing_qc(check_id):
    real = engine.run_quality_control

    def fake(**kwargs):
        qc = real(**kwargs)
        # Fail until the recovery pass has lowered the level.
        if float((kwargs.get("limiter_report") or {}).get("recovery_trim_db", 0.0)) == 0.0:
            qc["checks"].insert(0, {"id": check_id, "status": "fail", "message": "forced", "value": None})
            qc["passed"] = False
        return qc

    return fake


def test_unrecoverable_qc_failure_writes_no_file(source, tmp_path, monkeypatch):
    monkeypatch.setattr(engine, "run_quality_control", _failing_qc("phase_correlation"))
    out = tmp_path / "out.wav"
    with pytest.raises(InvalidAudioError, match="no master was delivered"):
        engine.render_preset_master(str(source), str(out), {"processing": {"eq": []}})
    assert not out.exists()


def test_level_failure_is_recovered_with_a_quieter_render(source, tmp_path, monkeypatch):
    monkeypatch.setattr(engine, "run_quality_control", _failing_qc("plr"))
    out = tmp_path / "out.wav"
    result = engine.render_preset_master(str(source), str(out), {"processing": {"limiter": {"target_lufs_i": -8.0}}})
    assert out.exists()
    recovery = result["processing_applied"]["qc_recovery"]
    assert "plr" in recovery["failed_checks"] and recovery["level_lowered_db"] in engine.RECOVERY_TRIMS_DB
    assert result["quality_control"]["passed"]
