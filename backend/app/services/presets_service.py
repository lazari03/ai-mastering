from __future__ import annotations

import json
from pathlib import Path


PRESETS_FILE = Path(__file__).resolve().parents[2] / "mixing_presets.json"


def _load_raw() -> dict:
    with PRESETS_FILE.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    presets = payload.get("presets")
    if not isinstance(presets, dict):
        raise ValueError("mixing_presets.json must define a 'presets' object")

    return payload


def list_mixing_presets() -> dict[str, dict]:
    payload = _load_raw()
    presets = payload["presets"]
    return {name: value for name, value in presets.items() if isinstance(value, dict)}


def get_mixing_preset(name: str) -> dict:
    presets = list_mixing_presets()
    if name not in presets:
        raise KeyError(name)
    return presets[name]
