# Chip effects — measured on a real mix

Method: `pop-before.mp3` (real, project-owned) mastered with the engine at `dsp-baseline` (before the DSP quality fixes), genre pop, style modern, nothing else selected = baseline. Each row changes ONE control and compares the master to the baseline master: Δ integrated LUFS, Δ crest, Δ stereo width (side/mid, dB), and the largest loudness-matched band change. Classes: **none** < 0.1 dB on every measure; **tiny** < 0.5 dB (likely inaudible); **measurable** ≥ 0.5 dB (plausibly audible). One track only — effects can differ on other material. Script: reproducible, deterministic.

Baseline: -10.12 LUFS, crest 10.21 dB.

| Control | Class | Δ LUFS | Δ crest | Δ width | max band Δ | low Δ | high Δ | note |
|---|---|---|---|---|---|---|---|---|
| tag:better_vocals | **none** | +0.00 | +0.00 | +0.00 | 0.00 | +0.00 | +0.00 |  |
| tag:deeper | **tiny** | -0.02 | -0.13 | -0.25 | 0.44 | +0.37 | -0.02 |  |
| tag:brighter | **tiny** | +0.01 | +0.03 | +0.02 | 0.31 | -0.06 | +0.31 |  |
| tag:warmer | **measurable** | -0.11 | +0.02 | +0.12 | 0.79 | +0.08 | -0.29 |  |
| tag:louder | **measurable** | -1.52 | +1.45 | -0.19 | 0.28 | +0.08 | -0.05 |  |
| tag:wider | **none** | +0.00 | +0.00 | +0.00 | 0.00 | +0.00 | +0.00 | identical to tag:better_vocals |
| tag:punchier_drums | **tiny** | -0.00 | -0.05 | -0.11 | 0.36 | +0.12 | -0.11 |  |
| tag:clearer | **tiny** | +0.00 | +0.00 | -0.06 | 0.37 | +0.04 | +0.21 |  |
| tag:softer | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 |  |
| category:clean | **tiny** | +0.39 | -0.38 | +0.09 | 0.13 | -0.12 | +0.03 |  |
| category:clean/detailed | **tiny** | +0.44 | -0.43 | +0.01 | 0.28 | -0.04 | +0.07 |  |
| category:clean/balanced | **tiny** | +0.39 | -0.38 | +0.09 | 0.13 | -0.12 | +0.03 | identical to category:clean |
| category:modern | **measurable** | -0.62 | +0.59 | -0.10 | 0.14 | +0.04 | -0.03 |  |
| category:modern/punchy | **measurable** | -0.62 | +0.59 | -0.10 | 0.14 | +0.04 | -0.03 | identical to category:modern |
| category:modern/dense | **measurable** | -0.62 | +0.59 | -0.10 | 0.14 | +0.04 | -0.03 | identical to category:modern |
| category:dynamic | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 | identical to tag:softer |
| category:dynamic/natural | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 | identical to tag:softer |
| category:dynamic/wide | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 | identical to tag:softer |
| category:punch | **tiny** | -0.29 | +0.26 | -0.05 | 0.07 | +0.02 | -0.01 |  |
| category:punch/impact | **measurable** | -0.63 | +0.51 | -0.24 | 0.36 | +0.15 | -0.15 |  |
| category:punch/forward | **tiny** | -0.29 | +0.24 | -0.14 | 0.30 | +0.16 | +0.02 |  |
| category:club | **measurable** | -0.89 | +0.76 | -0.28 | 0.41 | +0.16 | -0.17 |  |
| category:club/deep | **measurable** | -0.91 | +0.71 | -0.40 | 0.58 | +0.42 | -0.25 |  |
| category:club/aggressive | **measurable** | -0.79 | +0.71 | -0.02 | 0.32 | +0.13 | -0.23 |  |
| category:warm | **tiny** | +0.13 | -0.16 | +0.20 | 0.18 | -0.07 | -0.16 |  |
| category:warm/smooth | **tiny** | +0.13 | -0.16 | +0.20 | 0.18 | -0.07 | -0.16 | identical to category:warm |
| category:warm/saturated | **tiny** | +0.13 | -0.17 | +0.21 | 0.18 | -0.07 | -0.16 |  |
| category:bright | **tiny** | +0.00 | +0.01 | +0.00 | 0.11 | -0.01 | +0.11 |  |
| category:bright/crisp | **tiny** | -0.00 | -0.02 | -0.08 | 0.31 | +0.07 | +0.16 |  |
| category:vocal_focus | **tiny** | +0.17 | -0.18 | -0.03 | 0.36 | +0.04 | +0.11 |  |
| category:vocal_focus/present | **tiny** | +0.17 | -0.17 | -0.01 | 0.40 | -0.03 | +0.32 |  |
| category:bass_control | **none** | -0.00 | +0.01 | +0.01 | 0.07 | -0.07 | +0.05 |  |
| category:bass_control/controlled | **none** | -0.00 | +0.01 | +0.01 | 0.07 | -0.07 | +0.05 | identical to category:bass_control |
| style:rock_90s | **measurable** | -1.06 | +1.01 | -0.15 | 0.22 | +0.06 | -0.04 |  |
| style:rock_2000s | **tiny** | +0.19 | -0.17 | +0.04 | 0.05 | -0.05 | +0.01 |  |
| style:rock_modern | **tiny** | +0.39 | -0.38 | +0.09 | 0.13 | -0.12 | +0.03 | identical to category:clean |
| style:electronic_modern | **measurable** | +1.53 | -1.43 | +0.47 | 0.47 | -0.45 | +0.04 |  |
| style:stock_mastering_strip | **measurable** | -0.54 | +0.51 | -0.09 | 0.13 | +0.04 | -0.02 |  |
| style:vintage_analog | **measurable** | -1.94 | +1.93 | +0.10 | 0.15 | +0.03 | -0.11 |  |
| style:cd_loudness_war | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 | identical to tag:softer |
| style:vinyl_master | **measurable** | -1.16 | +1.16 | +0.11 | 0.13 | +0.03 | -0.10 |  |
| style:streaming_safe | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 | identical to tag:softer |
| style:hiphop_golden_era | **measurable** | -0.51 | +0.52 | +0.15 | 0.11 | +0.01 | -0.09 |  |
| style:hiphop_modern_trap | **measurable** | +1.39 | -1.30 | +0.43 | 0.41 | -0.39 | +0.03 |  |
| style:pop_80s | **measurable** | -0.89 | +0.84 | -0.13 | 0.19 | +0.05 | -0.04 |  |
| style:edm_festival | **measurable** | +1.53 | -1.43 | +0.47 | 0.47 | -0.45 | +0.04 | identical to style:electronic_modern |
| style:acoustic_natural | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 | identical to tag:softer |
| style:cinematic_score | **measurable** | +0.76 | -0.73 | +0.14 | 0.21 | -0.20 | +0.05 | identical to tag:softer |
| delivery:auto | **none** | +0.00 | +0.00 | +0.00 | 0.00 | +0.00 | +0.00 | identical to tag:better_vocals |
| delivery:streaming | **measurable** | -3.88 | +4.64 | -0.25 | 0.37 | +0.10 | -0.07 |  |
| delivery:apple | **measurable** | -5.88 | +4.64 | -0.25 | 0.37 | +0.10 | -0.07 |  |
| delivery:loud | **tiny** | +0.39 | -0.38 | +0.09 | 0.13 | -0.12 | +0.03 | identical to category:clean |
| tweak:low_end=+1 | **measurable** | -0.01 | -0.23 | -0.50 | 0.80 | -0.02 | -0.18 |  |
| tweak:low_end=-1 | **measurable** | +0.01 | +0.21 | +0.46 | 0.86 | -0.85 | +0.15 |  |
| tweak:punch=+1 | **none** | +0.00 | +0.00 | +0.00 | 0.00 | +0.00 | +0.00 | identical to tag:better_vocals |
| tweak:punch=-1 | **none** | +0.00 | +0.00 | +0.00 | 0.00 | +0.00 | +0.00 | identical to tag:better_vocals |
| tweak:presence=+1 | **tiny** | +0.02 | +0.10 | +0.12 | 0.48 | -0.21 | +0.23 |  |
| tweak:presence=-1 | **measurable** | -0.02 | -0.09 | -0.11 | 0.50 | +0.18 | +0.12 |  |
| tweak:brightness=+1 | **tiny** | -0.01 | +0.02 | +0.01 | 0.48 | -0.04 | +0.48 |  |
| tweak:brightness=-1 | **tiny** | +0.02 | -0.02 | -0.01 | 0.48 | +0.03 | -0.03 |  |
| tweak:warmth=+1 | **tiny** | +0.02 | -0.02 | +0.06 | 0.40 | -0.11 | -0.17 |  |
| tweak:warmth=-1 | **tiny** | -0.01 | +0.02 | -0.05 | 0.41 | -0.37 | +0.27 |  |
| tweak:width=+1 | **measurable** | +0.00 | +0.05 | +0.69 | 0.20 | -0.19 | -0.20 |  |
| tweak:width=-1 | **measurable** | -0.02 | -0.05 | -0.69 | 0.18 | +0.16 | +0.18 |  |
| tweak:loudness=+1 | **tiny** | +0.39 | -0.38 | +0.09 | 0.13 | -0.12 | +0.03 | identical to category:clean |
| tweak:loudness=-1 | **measurable** | -1.29 | +1.22 | -0.17 | 0.25 | +0.07 | -0.05 |  |
| tier:professional | **none** | -0.00 | +0.00 | +0.00 | 0.00 | +0.00 | +0.00 | identical to tag:better_vocals |

Summary: 67 controls — none: 8, tiny: 25, measurable: 34

