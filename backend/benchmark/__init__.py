"""# Listening benchmark

Evidence for "professional quality": the same mixes mastered by Auralith,
eMastered and a human engineer, measured at matched loudness and judged
blind.

## 1. Build the corpus (15–20 mixes)

Only mixes you have a licence to use — the corpus is **not** committed
(`corpus/` and `results/` are git-ignored). Cover the cases where problems
were heard:

| Coverage | Tracks | What it exposes |
|---|---|---|
| Rock / live drums | 4 | lost drums, pumping |
| Bass-heavy (hip-hop, EDM) | 4 | weaker bass, pumping |
| Acoustic / sparse | 3 | harsh highs, over-limiting quiet material |
| Vocal-forward pop | 3 | harsh highs, sibilance |
| Already-loud mixes | 3 | anything that adds damage to a finished-sounding mix |

```
benchmark/corpus/<track_id>/meta.json        {"genre": "rock", "tags": ["rock_drums"], "license": "who / terms"}
benchmark/corpus/<track_id>/mix.wav          unmastered mix (the file Auralith gets)
benchmark/corpus/<track_id>/refs/emastered.wav
benchmark/corpus/<track_id>/refs/human.wav
```

`genre` must be one of the engine's genres. Reference masters are made from
the same `mix.wav`.

## 2. Run it

```
cd backend
python -m benchmark.run_benchmark --corpus benchmark/corpus            # standard tier
python -m benchmark.run_benchmark --corpus benchmark/corpus --tier professional
```

Writes `benchmark/results/<date>/`: `report.md` (tables + summary),
`report.json`, `listening/<track>/A.wav…` (every version, including the raw
mix, gain-matched to one loudness with neutral letters) and
`listening_key.json`.

## 3. Listen blind

Give listeners only `listening/`. Per track, collect a preference ranking
and a note on drums, bass, highs and pumping. Unblind with
`listening_key.json` afterwards. Loudness is matched with gain only, so
nobody wins by being louder.

## What the flags mean

`benchmark/metrics.py`, limits shared with the engine's guardrails
(`ai_mastering/output_validation.py`):

- **lost_drums** — drum punch drops more than 12% at matched loudness
- **weaker_bass** — a musical low band (35–250 Hz) loses more than 2 dB relative to the mix
- **harsh_highs** — 4–20 kHz rises more than 2.5 dB relative to the mix
- **pumping** — 2–8 kHz dips more than 1 dB on kick hits vs. elsewhere

The same detectors run in CI on synthetic mixes
(`tests/test_benchmark_regressions.py`), so a change that reintroduces one
of these failures fails the tests before anyone has to hear it.
"""
