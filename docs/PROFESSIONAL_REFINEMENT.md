# Professional measured refinement

Professional keeps the shared diagnosis, confidence gates, delivery ceiling,
and final verification. After the normal recovery loop has produced a verified
master, it can use one spare render slot to compare a gentler dynamics plan.
Standard does not run that comparison.

The trial reduces compression by 25% and, where measured limiter reduction
exceeds 0.5 dB, reduces the limiter budget by up to 0.5 dB. EQ, user controls,
and the requested target are preserved. Selection requires a passing final
verdict and an improvement in transient retention, short-term crest, or limiter
load. Loudness shortfall may increase by at most 0.3 LU; tonal correction and
collateral may worsen by at most 0.1 dB. Failed or equivalent trials retain the
original. No extra processing is forced onto healthy audio.

The existing four-render budget includes this trial. Safety recovery takes
priority. Transparent fallback is never refined. Diagnostics and
processing_applied.delivery.professional_refinement expose attempted,
selected, reason, original/trial measurements, and the actions tried.
Refinement is reported separately from failure recovery.

## Real-audio regression setup

The real-audio workflow now runs on DSP/benchmark/dependency pull requests
from this repository and main pushes, as well as manual dispatch. Fork pull
requests do not run on the corpus machine. Both Standard and Professional
are checked, with separate report artifacts. This workflow detects changes;
repository required-check configuration must include both checks to block merges.

Provision a runner with the auralith-benchmark label, at least 50 licensed
mixes in /srv/auralith/benchmark-corpus/<track>/mix.wav, and reviewed baselines:
- /srv/auralith/baselines/real.json for Standard
- /srv/auralith/baselines/real-professional.json for Professional

Use meta.json beside each mix for its genre/style/tags. Include dense and
sparse arrangements, strong transients, already-limited mixes, bass-heavy and
bright material, mono and wide stereo, and representative sample rates.
Audio remains outside Git; retain license/provenance records with the corpus.

Generate proposed snapshots from a known release with
python -m benchmark.regression --corpus CORPUS --tier standard --write STANDARD.json
and the analogous --tier professional command. Review measurements and
level-matched listening before installing the baselines. A behaviour change
must not automatically overwrite its baseline to make CI pass.

Missing corpus/baselines fail explicitly; absent runners leave the checks
queued. Synthetic regression remains the fast check against the committed
Standard baseline. Measurements detect drift and safety regressions, but
listening remains necessary to assess perceived quality.
