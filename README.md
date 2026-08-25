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

1. **Analyze the input.** Measures integrated loudness (LUFS), loudness
   range, true peak, crest factor, stereo width/correlation, and a
   7-band spectral balance — a numeric fingerprint of how the track
   currently sounds.
2. **Build a target profile.** Starts from a genre baseline (pop, hip-hop,
   rock, EDM, acoustic, lo-fi, podcast, classical each have their own),
   then layers on tag biases (`louder`, `warmer`, `better_vocals`, etc.)
   and a mastering-style's deltas (loudness ceiling, dynamic range,
   stereo width, saturation, high-frequency cap).
3. **Compute adaptive corrections.** Diffs the measured fingerprint
   against the target profile and derives per-band EQ gain changes and
   multiband compression settings from that — the correction is a
   function of *this* track's actual measurements, not a static preset.
4. **Apply preset tweaks.** User- or preset-supplied sliders (low end,
   punch, presence, brightness, warmth, width, loudness) nudge the
   computed settings around their adaptive baseline.
5. **Process in mid/side, multiband.** Splits the signal into low,
   low-mid, high-mid, and high bands, applies compression and tone
   shaping per band in M/S space, then recombines.
6. **Color and width.** Adds measured harmonic saturation, section-aware
   stereo width and air automation, and a mono-compatibility check.
7. **Final bus stage.** Optional glue compression, gain to the target
   LUFS, a true-peak limiter (~-1 dBTP), and loudness-guard iterations
   so the result lands on target without visibly pumping or clipping.
8. **Output + report.** Writes the final file and returns a before/after
   analysis plus a summary of what was actually changed.

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
