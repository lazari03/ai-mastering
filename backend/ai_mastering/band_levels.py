"""Absolute per-band level measurement, in dB.

WHY THIS MODULE EXISTS
----------------------
Every band measurement in this codebase before this module was a *share*:
`_spectral_balance_only` divides each band's energy by the total, so the
seven numbers sum to 1.0 (see audio_utils.py). Shares are coupled — they
cannot move independently. Change one band's absolute level and every
other band's reported number changes with it, even though nothing about
those bands' actual content moved.

That makes shares structurally unable to answer the one question output
validation has to answer: "did this master lose low end / gain treble?"

Concretely, the failure this caused in mastering.py's post-render
verification: a render that only cuts bass mechanically raises the share
of every remaining band. The check read that as the presence region
"overshooting" its target and applied a corrective presence *cut* that was
never warranted — compounding the error rather than catching it. The
reverse hides real damage: a genuine 6 dB sub-bass cut barely moves the
share if neighbouring bands were attenuated too.

So: this module measures each band's ABSOLUTE level, in dB, independent of
every other band. Two bands can now both fall, both rise, or move in
opposite directions, and each is reported truthfully.

UNITS AND METHOD (stated explicitly — these are easy to get subtly wrong)
------------------------------------------------------------------------
- Level unit:  dBFS-referenced band power, 10*log10(mean power), where a
               full-scale sine in-band reads about -3.0 dB. It is NOT
               LUFS and NOT peak dBFS. Only ever compare these numbers to
               other numbers from this same function.
- Windowing:   STFT, n_fft=4096, hop=1024, Hann. Same transform size as
               _spectral_balance_only so the two agree about what a band
               contains and results stay comparable across the codebase.
- Channels:    mono sum ((L+R)/2) for band levels. Stereo questions are
               answered by the side-energy measurement, not here.
- Averaging:   MEAN power per frame across gated frames, then converted to
               dB — not the sum. A sum scales with track duration, which
               would make a 6-minute master look "louder" than the same
               master trimmed to 3 minutes. The mean is duration-invariant.
- Gating:      frames below GATE_REL_DB relative to the loudest frame are
               excluded, so silence, fades, and count-in gaps don't drag a
               band's average down and manufacture a phantom "loss".

Bands are finer than ANALYSIS_BANDS on purpose: a single 60-250 Hz bucket
cannot separate unwanted subsonic rumble from musical kick fundamental
from upper-bass body, which is exactly the distinction the engine needs in
order NOT to reflexively cut sub bass.
"""

from __future__ import annotations

import librosa
import numpy as np

EPS = 1e-12

# (low_hz, high_hz). Deliberately finer than audio_utils.ANALYSIS_BANDS
# through the low end, where mastering decisions do the most damage:
#   subsonic   — below musical content on nearly all material; rumble,
#                handling noise, room. Safe-ish to cut, and the ONLY band
#                where a cut should ever be automatic.
#   kick_bass  — kick fundamental and low bass notes. Cutting here is what
#                makes a master sound gutless; never treat it as subsonic.
#   upper_bass — bass harmonics and low-end body/warmth.
BAND_EDGES_HZ: dict[str, tuple[float, float]] = {
    "subsonic_20_35hz": (20.0, 35.0),
    "sub_bass_35_60hz": (35.0, 60.0),
    "kick_bass_60_120hz": (60.0, 120.0),
    "upper_bass_120_250hz": (120.0, 250.0),
    "low_mid_250_500hz": (250.0, 500.0),
    "mid_500_2000hz": (500.0, 2000.0),
    "high_mid_2000_4000hz": (2000.0, 4000.0),
    "presence_4000_6000hz": (4000.0, 6000.0),
    "high_6000_20000hz": (6000.0, 20000.0),
}

N_FFT = 4096
HOP = 1024

# A frame this far below the loudest frame is treated as silence/fade and
# excluded from the average. -60 dB is well below any musical content that
# should influence a band average, while still admitting quiet passages.
GATE_REL_DB = -60.0

# Floor for reporting. A band with genuinely no content (e.g. a 20-35 Hz
# band on a high-passed acoustic recording) reports this rather than -inf,
# which keeps arithmetic on the values finite.
LEVEL_FLOOR_DB = -120.0


def _mono(audio: np.ndarray) -> np.ndarray:
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 1:
        return audio
    if audio.shape[1] == 1:
        return audio[:, 0]
    return (audio[:, 0] + audio[:, 1]) * 0.5


def band_levels_db(audio: np.ndarray, sr: int) -> dict[str, float]:
    """Absolute level per band, in dB. See module docstring for units.

    Independent per band: cutting the bass does not change what the
    presence band reports, which is the entire point.
    """
    mono = _mono(audio)
    if mono.size < N_FFT:
        # Too short to transform meaningfully — report the floor rather
        # than raising, so a pathological fixture can't crash a render.
        return {name: LEVEL_FLOOR_DB for name in BAND_EDGES_HZ}

    stft = librosa.stft(mono, n_fft=N_FFT, hop_length=HOP)
    power = np.abs(stft) ** 2  # (freq_bins, frames)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)

    # Gate on BROADBAND frame energy, not per-band: gating each band
    # independently would let a band pick a different subset of the song
    # than its neighbours, so the resulting "levels" would describe
    # different moments and could not be compared to each other.
    frame_power = power.sum(axis=0)
    if not np.any(frame_power > 0):
        return {name: LEVEL_FLOOR_DB for name in BAND_EDGES_HZ}
    frame_db = 10.0 * np.log10(frame_power + EPS)
    keep = frame_db >= (float(frame_db.max()) + GATE_REL_DB)
    if not np.any(keep):
        keep = np.ones_like(frame_db, dtype=bool)

    nyquist = sr / 2.0
    levels: dict[str, float] = {}
    for name, (lo, hi) in BAND_EDGES_HZ.items():
        idx = np.where((freqs >= lo) & (freqs < min(hi, nyquist)))[0]
        if idx.size == 0:
            levels[name] = LEVEL_FLOOR_DB
            continue
        # Mean across gated frames of the summed in-band power. Summing
        # across the band's bins (energy in the band) then averaging over
        # time (duration-invariant) is the combination that makes these
        # comparable between two different renders of the same song.
        band_power_per_frame = power[idx, :][:, keep].sum(axis=0)
        mean_power = float(np.mean(band_power_per_frame))
        levels[name] = max(10.0 * np.log10(mean_power + EPS), LEVEL_FLOOR_DB)
    return levels


def level_deltas_db(before: dict[str, float], after: dict[str, float]) -> dict[str, float]:
    """after - before, per band, in dB. Positive means the band got louder.

    Only meaningful if the two measurements were taken at matched loudness
    (see loudness_matched_band_deltas) — otherwise every band shifts by the
    master's overall gain and the result says nothing about tonal balance.
    """
    return {name: round(float(after.get(name, LEVEL_FLOOR_DB) - before.get(name, LEVEL_FLOOR_DB)), 3) for name in BAND_EDGES_HZ}


def loudness_matched_band_deltas(
    source_audio: np.ndarray,
    rendered_audio: np.ndarray,
    sr: int,
    source_lufs: float,
    rendered_lufs: float,
) -> dict[str, float]:
    """Per-band dB change from source to render, with overall level removed.

    A master is louder than its source by design. Without gain-matching,
    every band reads "+7 dB" and the comparison cannot distinguish "the
    whole track got louder" (expected, fine) from "the low end was cut
    relative to everything else" (the thing worth catching).

    Matching is applied to the RENDER, pulling it back down to the source's
    integrated loudness, so the source measurement stays untouched — the
    same convention the transient QC in mastering.py already uses.
    """
    gain_db = float(np.clip(source_lufs - rendered_lufs, -24.0, 24.0))
    matched = np.asarray(rendered_audio, dtype=np.float32) * (10.0 ** (gain_db / 20.0))
    return level_deltas_db(band_levels_db(source_audio, sr), band_levels_db(matched, sr))
