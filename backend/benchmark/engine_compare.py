"""Engine comparison: the Standard and Professional bus chains on the same
pre-master, at the same loudness target and ceiling.

The engines share every planning decision; they differ in how the limiter
reduces gain (ai_mastering/engines.py). This runs both bus stages on
identical input and reports what that difference does:

  LUFS / TP      both must land on target, under the ceiling
  punch loss     drum onset strength over the bed, lost vs the input at
                 matched loudness (benchmark.metrics.compare) — lower is better
  HF duck p5     5th-percentile dip of the >2 kHz band, frame by frame,
                 relative to its median: how far vocals/cymbals duck under
                 the hits (closer to 0 is better)
  splatter       a 60 Hz hit under a steady 1 kHz tone, limited: energy where
                 the input has none, relative to the tone (lower is cleaner;
                 the input's own figure is printed as the floor)

Usage (from backend/):
  python -m benchmark.engine_compare                     # synthetic drum mix only
  python -m benchmark.engine_compare mix.wav other.mp3   # plus your own files
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

from ai_mastering.analysis.loudness import FastMeter  # noqa: E402
from ai_mastering.audio_utils import _true_peak_db  # noqa: E402
from ai_mastering.dsp_filters import _lr4_highpass  # noqa: E402
from ai_mastering.engines import ENGINES  # noqa: E402
from benchmark.metrics import compare  # noqa: E402
from benchmark.run_benchmark import SR, load  # noqa: E402
from synthetic import make_mix  # noqa: E402

TARGETS_LUFS = (-12.0, -10.0, -8.0)


def hf_duck_p5(source: np.ndarray, master: np.ndarray, frame_s: float = 0.01) -> float:
    a = _lr4_highpass(source.mean(axis=1), 2000.0, SR)
    b = _lr4_highpass(master.mean(axis=1), 2000.0, SR)
    n = int(SR * frame_s)
    k = len(a) // n
    ea = np.sqrt((a[: k * n].reshape(k, n) ** 2).mean(axis=1))
    eb = np.sqrt((b[: k * n].reshape(k, n) ** 2).mean(axis=1))
    active = ea > ea.max() * 0.01
    g = 20.0 * np.log10(eb[active] / ea[active])
    return float(np.percentile(g - np.median(g), 5))


def splatter_probe() -> np.ndarray:
    n = 10 * SR
    t = np.arange(n) / SR
    env = np.zeros(n)
    hit = np.exp(-np.arange(int(0.25 * SR)) / SR / 0.08)
    for start in range(0, n - len(hit), SR // 2):
        env[start : start + len(hit)] = np.maximum(env[start : start + len(hit)], hit)
    mono = (1.6 * env * np.sin(2 * np.pi * 60 * t) + 0.25 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)
    return np.stack([mono, mono], axis=1)


def splatter_db(x: np.ndarray) -> float:
    n = x.shape[0]
    spec = np.abs(np.fft.rfft(x[:, 0] * np.hanning(n))) ** 2
    f = np.fft.rfftfreq(n, 1.0 / SR)
    gaps = spec[((f > 200) & (f < 800)) | ((f > 1300) & (f < 20000))].sum()
    return float(10.0 * np.log10(gaps / spec[(f > 990) & (f < 1010)].sum()))


def bus(engine, x: np.ndarray, target: float) -> np.ndarray:
    params = {"target_lufs": target, "ceiling_dbtp": -1.0, "clipper_enabled": False, "limiter_release_ms": 80.0, "limiter_crest_floor_db": 6.0, "target_dynamic_range_db": 6.0}
    y, *_ = engine.bus(x, SR, params, apply_glue_compression=False)
    return y


def main() -> int:
    meter = FastMeter(SR)
    probe = splatter_probe()
    # Push the probe ~6 dB into the ceiling: the limiter has to act.
    print(f"splatter (input floor {splatter_db(probe):.1f} dB):")
    for engine in ENGINES.values():
        print(f"  {engine.name:13s} {splatter_db(bus(engine, probe, -6.0)):.1f} dB")

    sources = {"synthetic drum-heavy mix": make_mix(seconds=20.0, seed=3, drum_level=1.2, lufs=-18.0)}
    for path in sys.argv[1:]:
        sources[Path(path).name] = load(Path(path))
    for name, x in sources.items():
        print(f"\n== {name}")
        for target in TARGETS_LUFS:
            for engine in ENGINES.values():
                y = bus(engine, x, target)
                c = compare(x, y, SR)
                print(f"  {target:6.1f} LUFS  {engine.name:13s} -> {meter.integrated_loudness(y):6.2f} LUFS  TP {_true_peak_db(y, 16):6.2f}  punch loss {c['punch_loss']:.3f}  HF duck p5 {hf_duck_p5(x, y):6.2f} dB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
