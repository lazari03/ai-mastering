# Auralith Forge

An AI-assisted audio mastering platform. Upload a track (or a reference
track to match), and it comes back mastered — louder, tonally balanced,
and translation-safe — without needing to know EQ, compression, or
limiting yourself. It also offers standalone chord/key/BPM detection and
Demucs-based stem separation as their own features.

Three services: a Next.js frontend, an Express gateway (auth, billing,
quotas, request orchestration), and a Python FastAPI service that does
the actual DSP work. Firebase handles auth/data, Polar handles billing.

## What the DSP actually does

This isn't a single fixed "add some EQ and slam a limiter on it" chain,
and it isn't a wrapper around someone else's mastering API — it's a
self-hosted, analysis-first adaptive pipeline (`backend/ai_mastering/`)
that measures the input and computes what it needs, per track:

1. **Validate the input.** Rejects audio that genuinely can't be mastered
   (too short, non-finite samples, digital silence) and corrects DC
   offset in-place before anything downstream measures the signal
   (`ai_mastering/quality_control.py:validate_input_signal`).
2. **Analyze the input.** Measures integrated/short-term/momentary
   loudness (LUFS), loudness range, true peak, crest factor, stereo
   width/correlation, and a 7-band spectral balance — a numeric
   fingerprint of how the track currently sounds.
3. **Build a target profile.** Starts from a genre baseline (20 genres —
   pop, hip-hop, rock, metal, trap, R&B, reggaeton, Latin, EDM, house,
   techno, DnB, afrobeats, acoustic, singer-songwriter, jazz, classical,
   cinematic, lo-fi, podcast), then layers on tag biases (`louder`,
   `warmer`, `better_vocals`, etc.), a mastering-style's deltas (loudness
   ceiling, dynamic range, stereo width, saturation, high-frequency cap),
   and an optional mastering *category* — a musical-objective bias (Clean/
   Transparent, Modern/Loud, Dynamic/Open, Punch/Impact, Club/DJ, Warm/
   Analog, Bright/Air, Vocal Focus, Bass/Low-End Control), each with a
   few named flavours, layered on top rather than replacing genre/style
   (`params.py:MASTERING_CATEGORY_PROFILES`).
4. **Compute adaptive corrections.** Diffs the measured fingerprint
   against the target profile and derives per-band EQ gain changes and
   multiband compression settings from that — the correction is a
   function of *this* track's actual measurements, not a static preset.
   The correct answer for any stage can be "do nothing": thresholds,
   clamps, and the glue-compressor's own enable check all mean an
   already-balanced track gets little to no processing.
5. **Apply preset tweaks.** User- or preset-supplied sliders (low end,
   punch, presence, brightness, warmth, width, loudness) nudge the
   computed settings around their adaptive baseline.
6. **Process in mid/side, multiband.** Splits the signal into low,
   low-mid, high-mid, and high bands, applies compression and tone
   shaping per band in M/S space, then recombines.
7. **Color and width.** Adds measured harmonic saturation, section-aware
   stereo width and air automation, and a mono-compatibility check.
8. **Final bus stage.** Optional glue compression, gain to the target
   LUFS, a true-peak limiter (~-1 dBTP), and loudness-guard iterations
   so the result lands on target without visibly pumping or clipping.
9. **Quality control.** Runs automated checks against the actual rendered
   master — clipping, true-peak ceiling, limiter/compression severity,
   phase correlation, mono compatibility, DC offset, channel balance,
   rendering errors — and applies bounded, safe corrections (DC-offset
   removal, channel rebalancing) when one fails
   (`ai_mastering/quality_control.py:run_quality_control`).
10. **Output + report.** Writes the final file and returns a before/after
    analysis, a full A/B comparison with an "actually improved" verdict
    (not just "got louder") and a plain-language summary of what each
    stage decided to do (`ai_mastering/ab_analysis.py`).

Two adjacent, separately-invokable pieces of DSP live in the same
service:

- **Stem separation** (`ai_mastering/stem_separation.py`) — Demucs
  (`htdemucs_ft`/`htdemucs`) splits vocals from the instrumental bed so
  processing (e.g. vocal presence boosts) can be targeted at one without
  disturbing the other, then recombines.
- **Chord/key/BPM detection** (`app/services/chord_service.py`) — a
  separate analysis-only path (madmom/essentia), no mastering render
  involved, used both as a mastering aid and as its own standalone
  product.

Everything above runs on this app's own infrastructure — no third-party
"send the audio to someone else's AI mastering API" step anywhere in the
chain.
