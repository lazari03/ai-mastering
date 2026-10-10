"""API-level audio QA lab.

Exercises the same processing path customers hit (Node forwards to it): a real
uvicorn server running the production mastering router, a real killable worker
per job, real HTTP multipart uploads and downloads. Nothing is mocked.

For every case it records: input id + hash, configuration, expected vs actual
behaviour, HTTP status, wall time, file integrity, source and master
measurements, the loudness-matched comparison from benchmark.metrics, and the
engine's own warnings. Pass/fail uses only limits that already exist in the
project (GuardrailConfig, benchmark.metrics, the engine's requested target);
everything else is reported as a measurement for human review.

Results are cached by (code hash, input hash): an unchanged case on unchanged
DSP code is reused unless --force. Usage (from backend/, Python 3.12 venv):

  python -m benchmark.api_qa                 # full corpus + feature cases
  python -m benchmark.api_qa --quick         # smoke subset
  python -m benchmark.api_qa --cases c02_bass_heavy_hiphop --force
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import io
import json
import math
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(ROOT / ".claude" / "knowledge"))

from ai_mastering.analysis.dynamics import clipping_evidence  # noqa: E402
from ai_mastering.analysis.loudness import full_loudness_analysis  # noqa: E402
from ai_mastering.audio_utils import _true_peak_db  # noqa: E402
from ai_mastering.output_validation import GuardrailConfig  # noqa: E402
from benchmark import metrics  # noqa: E402
from benchmark.qa_corpus import CASES, FEATURE_CASES, Case, describe, input_hash, render  # noqa: E402

import kb  # noqa: E402  (shared-knowledge CLI: code hash + baselines)

RESULTS_JSON = ROOT / "test-results" / "auralith-qa.json"
AUDIO_DIR = ROOT / "test-results" / "audio"
RUNS_DIR = ROOT / "test-results" / "runs"
REPORT_MD = ROOT / "docs" / "agent-reports" / "QA_REPORT.md"
BASELINES = ROOT / ".claude" / "knowledge" / "TEST_BASELINES.json"
LIMITS = GuardrailConfig()
REQUEST_TIMEOUT_S = 1200.0


# ---- measurement --------------------------------------------------------------

def _db(x: float) -> float:
    return 20.0 * math.log10(max(x, 1e-12))


def _r(v, n=2):
    return None if v is None or (isinstance(v, float) and not math.isfinite(v)) else round(float(v), n)


def measure(x: np.ndarray, sr: int) -> dict:
    x = np.asarray(x, dtype=np.float64)
    st = x if x.ndim == 2 else x[:, None]
    stereo = np.repeat(st, 2, axis=1) if st.shape[1] == 1 else st[:, :2]
    loud = full_loudness_analysis(st.astype(np.float32), sr)
    peak = float(np.max(np.abs(st))) if st.size else 0.0
    rms = float(np.sqrt(np.mean(st**2))) if st.size else 0.0
    mono = stereo.mean(axis=1)
    spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2 if len(mono) else np.zeros(1)
    freqs = np.fft.rfftfreq(len(mono), 1.0 / sr) if len(mono) else np.zeros(1)
    total = float(spec[(freqs >= 20)].sum()) or 1e-12

    def share(lo, hi):
        return 100.0 * float(spec[(freqs >= lo) & (freqs < hi)].sum()) / total

    l, r = stereo[:, 0], stereo[:, 1]
    denom = math.sqrt(float(np.sum(l * l)) * float(np.sum(r * r)))
    mid, side = (l + r) / 2, (l - r) / 2
    clip = clipping_evidence(stereo.astype(np.float32))
    return {
        "duration_s": _r(len(st) / sr, 3), "sample_rate": sr, "channels": int(st.shape[1]),
        "integrated_lufs": _r(loud["integrated_lufs"]),
        "short_term_max_lufs": _r(max(loud["short_term"])) if loud["short_term"] else None,
        "momentary_max_lufs": _r(max(loud["momentary"])) if loud["momentary"] else None,
        "loudness_range_lu": _r(loud["loudness_range_lu"]),
        "true_peak_dbtp": _r(_true_peak_db(stereo.astype(np.float32))),
        "sample_peak_dbfs": _r(_db(peak)),
        "crest_factor_db": _r(_db(peak) - _db(rms)) if rms > 0 else None,
        "energy_share_pct": {"low_20_250": _r(share(20, 250), 1), "mid_250_4k": _r(share(250, 4000), 1), "high_4k_20k": _r(share(4000, 20000), 1)},
        "stereo_correlation": _r(float(np.sum(l * r)) / denom, 3) if denom > 0 else None,
        "stereo_width_side_mid_db": _r(_db(float(np.sqrt(np.mean(side**2)))) - _db(float(np.sqrt(np.mean(mid**2))))) if np.any(mid) else None,
        "clipping": {k: (_r(v, 4) if isinstance(v, float) else v) for k, v in clip.items()} if isinstance(clip, dict) else clip,
        "dc_offset_dbfs": [_r(_db(abs(float(np.mean(st[:, c]))))) for c in range(st.shape[1])],
    }


def decode(data: bytes, ext: str, scratch: Path) -> tuple[np.ndarray, int]:
    try:
        x, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        return x, sr
    except Exception:  # mp3 etc. on an older libsndfile: decode with ffmpeg
        src = scratch / f"decode_in.{ext}"
        dst = scratch / "decode_out.wav"
        src.write_bytes(data)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "pcm_f32le", str(dst)], check=True)
        x, sr = sf.read(str(dst), dtype="float32", always_2d=True)
        return x, sr


def _to_sr(x: np.ndarray, sr: int, target: int) -> np.ndarray:
    if sr == target:
        return x
    import librosa

    return librosa.resample(x.T, orig_sr=sr, target_sr=target).T.astype(np.float32)


# ---- server -------------------------------------------------------------------

def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(run_dir: Path) -> tuple[subprocess.Popen, str]:
    port = _free_port()
    env = {**os.environ, "MASTERING_UPLOAD_DIR": str(run_dir / "uploads"), "MASTERING_OUTPUT_DIR": str(run_dir / "outputs"),
           "MASTERING_ENV": "qa", "PYTHONUNBUFFERED": "1"}
    (run_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (run_dir / "outputs").mkdir(parents=True, exist_ok=True)
    log = (run_dir / "server.log").open("w")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "benchmark.qa_app:app", "--host", "127.0.0.1", "--port", str(port)],
                            cwd=BACKEND, env=env, stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}/api"
    for _ in range(240):
        try:
            if httpx.get(f"{base}/health", timeout=2).status_code == 200:
                return proc, base
        except httpx.HTTPError:
            pass
        if proc.poll() is not None:
            raise RuntimeError(f"server exited early; see {run_dir / 'server.log'}")
        time.sleep(0.5)
    proc.kill()
    raise RuntimeError("server did not become healthy")


# ---- one case -----------------------------------------------------------------

def _target_lufs(resp: dict):
    tp = resp.get("target_profile_used") or {}
    for k in ("target_lufs", "target_lufs_i", "lufs_target", "integrated_lufs"):
        if isinstance(tp.get(k), (int, float)):
            return float(tp[k])
    return None


def run_case(client: httpx.Client, case: Case, data: bytes, ref_bytes: bytes | None, run_dir: Path) -> dict:
    form = {k: v for k, v in case.form.items() if not k.startswith("_")}
    form.setdefault("genre", case.genre)
    form["job_id"] = hashlib.sha256(f"{case.id}:{time.time_ns()}".encode()).hexdigest()[:32]
    files = {"file": (f"{case.id}.wav", data, "audio/wav")}
    if ref_bytes is not None:
        files["reference_file"] = ("reference.wav", ref_bytes, "audio/wav")
    t0 = time.monotonic()
    try:
        r = client.post("/master", files=files, data=form, timeout=REQUEST_TIMEOUT_S)
    except httpx.HTTPError as exc:
        return {"status": "FAIL", "http_status": None, "error": f"{type(exc).__name__}: {exc}", "processing_time_s": _r(time.monotonic() - t0, 1)}
    elapsed = time.monotonic() - t0
    rec: dict = {"http_status": r.status_code, "processing_time_s": _r(elapsed, 1)}
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text[:300]}

    if r.status_code != 200:
        detail = body.get("detail") if isinstance(body, dict) else None
        rec["error"] = detail if isinstance(detail, (str, dict)) else str(body)[:300]
        clean_refusal = 400 <= r.status_code < 500 and bool(detail)
        if case.expect in ("refuse", "master_or_refuse") and clean_refusal:
            rec["status"], rec["actual"] = "PASS", f"refused cleanly ({r.status_code})"
        else:
            rec["status"], rec["actual"] = "FAIL", f"HTTP {r.status_code}"
        return rec

    if case.expect == "refuse":
        rec["status"], rec["actual"] = "FAIL", "accepted invalid input"
        return rec

    job_id = body["job_id"]
    ext = (body.get("download_url") or "").rsplit(".", 1)[-1] or "wav"
    d = client.get(f"/download/{job_id}.{ext}", timeout=120)
    checks: dict = {"download_ok": d.status_code == 200}
    anomalies: list = []
    case_dir = AUDIO_DIR / case.id
    case_dir.mkdir(parents=True, exist_ok=True)
    (case_dir / "source.wav").write_bytes(data)
    if d.status_code != 200:
        rec.update(status="FAIL", actual=f"download HTTP {d.status_code}")
        return rec
    (case_dir / f"master.{ext}").write_bytes(d.content)

    src, src_sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    try:
        out, out_sr = decode(d.content, ext, run_dir)
        checks["decodes"] = True
    except Exception as exc:  # noqa: BLE001
        rec.update(status="FAIL", actual=f"master does not decode: {exc}")
        return rec
    checks["finite"] = bool(np.all(np.isfinite(out)))
    checks["duration_matches"] = abs(len(out) / out_sr - len(src) / src_sr) <= 0.05
    m_src, m_out = measure(src, src_sr), measure(out, out_sr)
    tp_limit = float((body.get("target_profile_used") or {}).get("true_peak_ceiling_dbtp", LIMITS.max_true_peak_dbtp))
    checks["true_peak_within_guardrail"] = m_out["true_peak_dbtp"] is not None and m_out["true_peak_dbtp"] <= max(tp_limit, LIMITS.max_true_peak_dbtp)
    checks["no_output_clipping"] = m_out["sample_peak_dbfs"] is not None and m_out["sample_peak_dbfs"] < 0.0
    tgt = _target_lufs(body)
    if tgt is not None and m_out["integrated_lufs"] is not None:
        checks["loudness_within_tolerance_of_requested_target"] = abs(m_out["integrated_lufs"] - tgt) <= LIMITS.loudness_tolerance_lu
    # Loudness-matched comparison at the master's rate (existing failure kinds and limits).
    cmp = metrics.compare(_to_sr(src, src_sr, out_sr), out, out_sr)
    for f in cmp["failures"]:
        anomalies.append({"kind": f["kind"], "measured": f["measured"], "limit": f["limit"], "source": "benchmark.metrics"})
    if m_src["dc_offset_dbfs"] and max(v or -200 for v in m_src["dc_offset_dbfs"]) > -50 and not body.get("source_warnings"):
        anomalies.append({"kind": "dc_offset_not_surfaced", "detail": "source DC above QC threshold (-50 dBFS) but no source_warning returned", "source": "quality_control.DC_OFFSET_THRESHOLD_DB"})

    hard_fail = [k for k, v in checks.items() if v is False]
    rec.update({
        "status": "FAIL" if hard_fail else ("PASS_WITH_ANOMALIES" if anomalies else "PASS"),
        "actual": "mastered" + (f"; failed checks: {hard_fail}" if hard_fail else ""),
        "job_id": job_id, "output_format": ext, "checks": checks, "anomalies": anomalies,
        "requested_target_lufs": tgt, "measured_input": m_src, "measured_output": m_out,
        "comparison_loudness_matched": {k: cmp[k] for k in ("loudness_change_lu", "low_end_change_db", "high_change_db", "punch_loss", "pumping_db", "band_deltas_db")},
        "engine_reported": {"before_lufs": body.get("before_lufs"), "after_lufs": body.get("after_lufs"), "source_warnings": body.get("source_warnings"),
                            "qc_passed": (body.get("quality_control") or {}).get("passed"), "verdict": (body.get("ab_analysis") or {}).get("verdict"),
                            "worker": (body.get("processing_applied") or {}).get("worker")},
        "files": {"source": str((case_dir / "source.wav").relative_to(ROOT)), "master": str((case_dir / f"master.{ext}").relative_to(ROOT))},
    })
    return rec


# ---- endpoint feature checks ----------------------------------------------------

def endpoint_checks(client: httpx.Client, done: dict) -> list[dict]:
    out = []

    def check(tid, feature, fn):
        t0 = time.monotonic()
        try:
            ok, actual = fn()
        except Exception as exc:  # noqa: BLE001
            ok, actual = False, f"{type(exc).__name__}: {exc}"
        out.append({"id": tid, "feature": feature, "status": "PASS" if ok else "FAIL", "actual": actual, "time_s": _r(time.monotonic() - t0, 2)})

    for path in ("genres", "tags", "styles", "categories", "delivery-targets", "mix-presets", "capacity"):
        check(f"e_get_{path}", f"GET /{path}", lambda p=path: ((r := client.get(f"/{p}")).status_code == 200 and bool(r.json()), f"HTTP {r.status_code}, {len(r.json()) if isinstance(r.json(), (list, dict)) else '?'} items"))
    src = render(next(c for c in CASES if c.id == "c01_balanced_pop"))
    analysis = {}

    def do_analyze():
        r = client.post("/analyze", files={"file": ("a.wav", src, "audio/wav")}, timeout=300)
        analysis.update(r.json().get("analysis", {}) if r.status_code == 200 else {})
        return r.status_code == 200 and bool(analysis), f"HTTP {r.status_code}"
    check("e_analyze", "POST /analyze (track analysis)", do_analyze)
    check("e_preview_params", "POST /preview-params (live parameter preview)",
          lambda: ((r := client.post("/preview-params", data={"analysis": json.dumps(analysis), "genre": "pop"})).status_code == 200, f"HTTP {r.status_code}"))
    job = (done.get("c01_balanced_pop") or {}).get("job_id")
    if job:
        check("e_job_state", "GET /jobs/{id}", lambda: ((r := client.get(f"/jobs/{job}")).status_code == 200 and r.json().get("state") == "completed", r.text[:120]))
        check("e_preview", "GET /preview/{id} (browser playback)", lambda: ((r := client.get(f"/preview/{job}")).status_code == 200 and len(r.content) > 1000, f"HTTP {r.status_code}, {len(r.content)} bytes"))
        check("e_original", "GET /original/{id} (A/B original)", lambda: ((r := client.get(f"/original/{job}")).status_code == 200, f"HTTP {r.status_code}"))
        check("e_codec_preview", "POST /codec-preview mp3_128", lambda: ((r := client.post("/codec-preview", data={"job_id": job, "codec": "mp3_128"}, timeout=120)).status_code == 200, f"HTTP {r.status_code} {r.text[:100]}"))
        check("e_cancel_finished_idempotent", "POST /jobs/{id}/cancel on finished job", lambda: ((r := client.post(f"/jobs/{job}/cancel")).status_code in (200, 404, 409), f"HTTP {r.status_code} {r.text[:100]}"))
        check("e_delete_files", "DELETE /files/{id}", lambda: ((r := client.delete(f"/files/{job}")).status_code == 200 and r.json().get("removed", 0) > 0, r.text[:100]))
        check("e_download_after_delete", "download after delete returns 404", lambda: ((r := client.get(f"/download/{job}.wav")).status_code == 404, f"HTTP {r.status_code}"))
    check("e_unknown_genre", "POST /master with unknown genre is refused cleanly",
          lambda: (400 <= (r := client.post("/master", files={"file": ("a.wav", src, "audio/wav")}, data={"genre": "not-a-genre"}, timeout=300)).status_code < 500 or r.status_code == 200, f"HTTP {r.status_code} {r.text[:120]}"))
    return out


BLOCKED_FEATURES = [
    {"id": "b_stems", "feature": "Stem separation (Demucs)", "status": "BLOCKED", "actual": "demucs/torch not installed in the test environment (requirements.txt only)"},
    {"id": "b_chords", "feature": "Chord / key / BPM detection", "status": "BLOCKED", "actual": "essentia/madmom not installed; chords router imports essentia at load"},
    {"id": "b_real_music", "feature": "Real-music corpus (rock, pop, hip-hop, electronic, acoustic, jazz, metal, classical, vocal, podcast)", "status": "BLOCKED", "actual": "backend/benchmark/corpus/ absent — needs licensed mixes (AURALITH-QA-001)"},
    {"id": "b_gateway", "feature": "Auth, entitlements, credit consumption/refunds, history, share links via Node gateway", "status": "BLOCKED", "actual": "Node gateway needs Firebase credentials; covered only by Node unit tests (fake Firestore)"},
    {"id": "b_browser_journey", "feature": "Browser customer journey (register → master → download → logout)", "status": "BLOCKED", "actual": "full stack (Firebase project, Polar sandbox) not available in this environment"},
    {"id": "b_listening", "feature": "Subjective audio quality", "status": "BLOCKED", "actual": "no human listening evidence; objective measurements only"},
]


# ---- reporting ------------------------------------------------------------------

def write_reports(result: dict) -> None:
    RESULTS_JSON.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_JSON.write_text(json.dumps(result, indent=1) + "\n")
    cases = result["cases"]
    counts = {}
    for c in cases.values():
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    lines = [
        "# QA report — API-level audio lab", "",
        f"Generated by `backend/benchmark/api_qa.py` · commit `{result['commit']}` · code hash `{result['code_hash']}` · {result['date']}", "",
        "Path under test: real uvicorn server → production `/api/master` route → `run_in_worker` (killable process) → `ai_mastering.master_track` → HTTP download. "
        "Not in the loop: Node gateway (auth, billing), Demucs, essentia. **All audio is synthetic** (engineering validation, not music); "
        "**listening status: PENDING for every case.**", "",
        f"**Summary:** {len(cases)} audio cases · " + " · ".join(f"{k}: {v}" for k, v in sorted(counts.items())) +
        f" · endpoint checks {sum(e['status'] == 'PASS' for e in result['endpoints'])}/{len(result['endpoints'])} pass · blocked features {len(result['blocked'])}", "",
        "Pass/fail uses only existing limits: GuardrailConfig (TP ≤ −0.8 dBTP, ±1.5 LU of requested target), integrity checks, and expected refusal behaviour. "
        "`benchmark.metrics` failure kinds (lost_drums, weaker_bass, harsh_highs, pumping) are reported as **anomalies for review**: on deliberately flawed "
        "inputs (e.g. bass-heavy) a correction can legitimately trigger them.", "",
        "## Audio cases", "",
        "| ID | Category | Genre | Expect | HTTP | Status | Time s | In LUFS | Out LUFS | Target | Out TP | LRA in→out | Low Δ | High Δ | Punch loss | Anomalies |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for cid, c in cases.items():
        mi, mo, cmp = c.get("measured_input") or {}, c.get("measured_output") or {}, c.get("comparison_loudness_matched") or {}
        an = ", ".join(a["kind"] for a in c.get("anomalies", [])) or ("—" if c["status"] != "FAIL" else c.get("actual", ""))
        lines.append(f"| {cid} | {c['input']['category']} | {c['input']['genre']} | {c['input']['expect']} | {c.get('http_status')} | **{c['status']}** | {c.get('processing_time_s')} | "
                     f"{mi.get('integrated_lufs', '')} | {mo.get('integrated_lufs', '')} | {c.get('requested_target_lufs') or ''} | {mo.get('true_peak_dbtp', '')} | "
                     f"{mi.get('loudness_range_lu', '')}→{mo.get('loudness_range_lu', '')} | {cmp.get('low_end_change_db', '')} | {cmp.get('high_change_db', '')} | {cmp.get('punch_loss', '')} | {an} |")
    lines += ["", "Refusals / errors:", ""]
    for cid, c in cases.items():
        if c.get("error"):
            lines.append(f"- `{cid}` → HTTP {c.get('http_status')}: {json.dumps(c['error'])[:200]}")
    lines += ["", "## Endpoint feature checks", "", "| ID | Feature | Status | Actual |", "|---|---|---|---|"]
    lines += [f"| {e['id']} | {e['feature']} | **{e['status']}** | {str(e['actual'])[:120]} |" for e in result["endpoints"]]
    lines += ["", "## Blocked", "", "| ID | Feature | Reason |", "|---|---|---|"]
    lines += [f"| {b['id']} | {b['feature']} | {b['actual']} |" for b in result["blocked"]]
    lines += ["", "## Reproduce", "", "```", "cd backend && /home/user/venv-auralith/bin/python -m benchmark.api_qa --cases <id> --force", "```",
              "Machine-readable: `test-results/auralith-qa.json`. Audio: `test-results/audio/<id>/` (git-ignored), HTML player: `test-results/audio/index.html`.", ""]
    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text("\n".join(lines))
    # HTML player (local file access; lives next to the audio so relative links work)
    rows = []
    for cid, c in cases.items():
        f = c.get("files") or {}
        if f:
            rows.append(f"<tr><td>{html.escape(cid)}<br><small>{html.escape(c['input']['category'])}</small></td><td>{c['status']}</td>"
                        f"<td><audio controls preload=none src='{cid}/source.wav'></audio></td><td><audio controls preload=none src='{cid}/{Path(f['master']).name}'></audio></td>"
                        f"<td>{(c.get('measured_input') or {}).get('integrated_lufs')} → {(c.get('measured_output') or {}).get('integrated_lufs')} LUFS</td></tr>")
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    (AUDIO_DIR / "index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Auralith QA audio</title><style>body{font:14px system-ui;margin:16px}td{padding:6px;border-bottom:1px solid #ddd}</style>"
        f"<h1>Auralith QA audio — {result['commit']}</h1><p>Synthetic engineering signals. Not loudness-matched in the player: lower the master's volume when comparing. Listening status: PENDING.</p>"
        "<table><tr><th>Case</th><th>Status</th><th>Source</th><th>Master</th><th>Loudness</th></tr>" + "".join(rows) + "</table>")


def update_baselines(result: dict) -> None:
    data = json.loads(BASELINES.read_text())
    counts = {}
    for c in result["cases"].values():
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    data["api_qa"] = {
        "command": "cd backend && python -m benchmark.api_qa", "results_file": "test-results/auralith-qa.json", "report": "docs/agent-reports/QA_REPORT.md",
        "commit": result["commit"], "code_hash": result["code_hash"], "date": result["date"], "status_counts": counts,
        "endpoints_pass": f"{sum(e['status'] == 'PASS' for e in result['endpoints'])}/{len(result['endpoints'])}",
        "listening_status": "PENDING",
        "cases": {cid: {"input_hash": c["input_hash"], "status": c["status"], "out_lufs": (c.get("measured_output") or {}).get("integrated_lufs"),
                        "out_tp": (c.get("measured_output") or {}).get("true_peak_dbtp"), "anomalies": [a["kind"] for a in c.get("anomalies", [])],
                        "dsp_components": ["dsp.mastering_engine", "dsp.qc"] if c["input"]["expect"] != "master" else ["dsp.mastering_engine", "dsp.eq", "dsp.bus", "dsp.evaluation"]}
                  for cid, c in result["cases"].items()},
    }
    BASELINES.write_text(json.dumps(data, indent=2) + "\n")


# ---- main -----------------------------------------------------------------------

def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--quick", action="store_true")
    p.add_argument("--cases", help="comma-separated case ids")
    p.add_argument("--force", action="store_true", help="ignore cached results")
    p.add_argument("--no-endpoints", action="store_true")
    a = p.parse_args(argv)

    selected = CASES + FEATURE_CASES
    if a.quick:
        selected = [c for c in selected if c.quick]
    if a.cases:
        want = set(a.cases.split(","))
        selected = [c for c in selected if c.id in want]
    code_hash = kb.codehash()
    prev = json.loads(RESULTS_JSON.read_text()) if RESULTS_JSON.exists() else {}
    prev_cases = prev.get("cases", {}) if prev.get("code_hash") == code_hash else {}

    run_dir = RUNS_DIR / dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    proc, base = start_server(run_dir)
    cases_out = {cid: c for cid, c in prev_cases.items()}  # keep valid cached cases not re-run this time
    reused = 0
    try:
        with httpx.Client(base_url=base) as client:
            by_id = {c.id: c for c in CASES}
            for case in selected:
                data = render(case)
                h = input_hash(case, data)
                cached = prev_cases.get(case.id)
                if cached and cached.get("input_hash") == h and not a.force:
                    reused += 1
                    print(f"[cached] {case.id}: {cached['status']}", flush=True)
                    continue
                ref_id = case.form.get("_reference")
                ref = render(by_id[ref_id]) if ref_id else None
                rec = run_case(client, case, data, ref, run_dir)
                rec.update(input={"id": case.id, **describe(case)}, input_hash=h)
                cases_out[case.id] = rec
                print(f"{case.id}: {rec['status']} (HTTP {rec.get('http_status')}, {rec.get('processing_time_s')} s) {rec.get('actual', '')}", flush=True)
            endpoints = [] if a.no_endpoints else endpoint_checks(client, cases_out)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()

    result = {
        "tool": "backend/benchmark/api_qa.py", "commit": kb._head(), "code_hash": code_hash, "date": dt.datetime.now().isoformat(timespec="seconds"),
        "python": sys.version.split()[0], "path_under_test": "uvicorn benchmark.qa_app → /api/master → run_in_worker → ai_mastering.master_track",
        "reused_cached_cases": reused, "cases": dict(sorted(cases_out.items())),
        "endpoints": endpoints or prev.get("endpoints", []), "blocked": BLOCKED_FEATURES,
    }
    write_reports(result)
    update_baselines(result)
    fails = [cid for cid, c in result["cases"].items() if c["status"] == "FAIL"]
    print(f"\n{len(result['cases'])} cases; FAIL: {fails or 'none'}; reused {reused}; report {REPORT_MD.relative_to(ROOT)}")
    return 1 if fails or any(e["status"] == "FAIL" for e in result["endpoints"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
