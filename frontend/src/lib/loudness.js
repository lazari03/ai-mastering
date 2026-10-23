// ITU-R BS.1770 / EBU R128 loudness, computed in the browser.
//
// A port of the engine's own meter (backend/ai_mastering/analysis/loudness.py
// FastMeter, which mirrors pyloudnorm) and true-peak check
// (audio_utils._true_peak_db: scipy resample_poly 4x). Same K-weighting
// biquads, block bounds, gates and LRA percentiles. The caller decodes at
// 44.1 kHz, the rate the engine resamples every upload to. Pure functions,
// no DOM, so it runs in a Web Worker and under `node --test`.

const ABS_GATE = -70;

// pyloudnorm's IIRfilter.generate_coefficients (RBJ cookbook), normalised
// by a0. Stage 1: high shelf +4 dB @ 1500 Hz, Q 1/sqrt(2). Stage 2: high
// pass @ 38 Hz, Q 0.5.
function biquad(type, G, Q, fc, rate) {
  const A = 10 ** (G / 40);
  const w0 = (2 * Math.PI * fc) / rate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  let b, a;
  if (type === "high_shelf") {
    const s = 2 * Math.sqrt(A) * alpha;
    b = [A * (A + 1 + (A - 1) * cos + s), -2 * A * (A - 1 + (A + 1) * cos), A * (A + 1 + (A - 1) * cos - s)];
    a = [A + 1 - (A - 1) * cos + s, 2 * (A - 1 - (A + 1) * cos), A + 1 - (A - 1) * cos - s];
  } else {
    b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  }
  return { b0: b[0] / a[0], b1: b[1] / a[0], b2: b[2] / a[0], a1: a[1] / a[0], a2: a[2] / a[0] };
}

export function kWeightingFilters(rate) {
  return [biquad("high_shelf", 4.0, 1 / Math.sqrt(2), 1500.0, rate), biquad("high_pass", 0.0, 0.5, 38.0, rate)];
}

// Block bounds exactly as pyloudnorm / FastMeter._block_powers compute them
// (same float expressions, truncated to int).
function blockBounds(n, rate, blockSize, overlap) {
  const step = 1.0 - overlap;
  const t = n / rate;
  const count = Math.round((t - blockSize) / (blockSize * step)) + 1;
  const lo = new Array(Math.max(0, count));
  const hi = new Array(Math.max(0, count));
  for (let j = 0; j < count; j++) {
    lo[j] = Math.min(n, Math.max(0, Math.trunc(blockSize * (j * step) * rate)));
    hi[j] = Math.min(n, Math.max(0, Math.trunc(blockSize * (j * step + 1) * rate)));
  }
  return { lo, hi, count: Math.max(0, count) };
}

// Running sum of the K-weighted signal's squares, sampled only at the
// indices the block bounds need: one streaming pass per channel instead of
// a full-length float64 cumulative-sum array (that would be 64 MB/channel
// for a 3-minute song).
function prefixSumsAt(samples, filters, indices) {
  const order = Array.from(indices.keys()).sort((x, y) => indices[x] - indices[y]);
  const out = new Float64Array(indices.length);
  const [f1, f2] = filters;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0; // stage 1 state
  let u1 = 0, u2 = 0, v1 = 0, v2 = 0; // stage 2 state
  let acc = 0;
  let pos = 0;
  for (const k of order) {
    const target = indices[k];
    for (; pos < target && pos < samples.length; pos++) {
      const x = samples[pos];
      const y = f1.b0 * x + f1.b1 * x1 + f1.b2 * x2 - f1.a1 * y1 - f1.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const v = f2.b0 * y + f2.b1 * u1 + f2.b2 * u2 - f2.a1 * v1 - f2.a2 * v2;
      u2 = u1; u1 = y; v2 = v1; v1 = v;
      acc += v * v;
    }
    out[k] = acc;
  }
  return out;
}

// Mean-square per block per channel: z[ch][j].
function blockPowers(channels, rate, blockSize, overlap, paddedLength) {
  const n = paddedLength ?? channels[0].length;
  const { lo, hi, count } = blockBounds(n, rate, blockSize, overlap);
  const filters = kWeightingFilters(rate);
  const denom = blockSize * rate;
  return channels.map((samples) => {
    // Zero padding past the real signal adds nothing to the running sum, so
    // a padded bound simply reads the total.
    const sums = prefixSumsAt(samples, filters, [...lo, ...hi]);
    const z = new Float64Array(count);
    for (let j = 0; j < count; j++) z[j] = (sums[count + j] - sums[j]) / denom;
    return z;
  });
}

function blockLoudness(z, j) {
  let s = 0;
  for (const ch of z) s += ch[j]; // channel gains are 1.0 for L/R
  return -0.691 + 10 * Math.log10(s);
}

export function integratedLoudness(channels, rate) {
  if (channels[0].length < 0.4 * rate) return -Infinity;
  const z = blockPowers(channels, rate, 0.4, 0.75);
  const count = z[0].length;
  const loud = new Float64Array(count);
  for (let j = 0; j < count; j++) loud[j] = blockLoudness(z, j);

  const meanOver = (keep) => {
    let s = 0, kept = 0;
    const sums = z.map(() => 0);
    for (let j = 0; j < count; j++) {
      if (!keep(j)) continue;
      kept++;
      z.forEach((ch, c) => (sums[c] += ch[j]));
    }
    if (!kept) return null;
    for (const v of sums) s += v / kept;
    return -0.691 + 10 * Math.log10(s);
  };

  const gammaA = meanOver((j) => loud[j] >= ABS_GATE);
  if (gammaA === null) return -Infinity;
  const gammaR = gammaA - 10;
  const value = meanOver((j) => loud[j] > gammaR && loud[j] > ABS_GATE);
  return value === null ? -Infinity : value;
}

// numpy.percentile, default linear interpolation.
function percentile(sorted, p) {
  const idx = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function loudnessRange(channels, rate) {
  const n = channels[0].length + Math.trunc(1.5 * rate);
  if (n < 3.0 * rate) return NaN;
  const z = blockPowers(channels, rate, 3.0, 0.97, n);
  const stl = [];
  for (let j = 0; j < z[0].length; j++) {
    const l = blockLoudness(z, j);
    if (l >= ABS_GATE) stl.push(l);
  }
  if (!stl.length) return NaN;
  const integrated = 10 * Math.log10(stl.reduce((s, l) => s + 10 ** (l / 10), 0) / stl.length);
  const rel = stl.filter((l) => l >= integrated - 20).sort((x, y) => x - y);
  if (!rel.length) return NaN;
  return percentile(rel, 95) - percentile(rel, 10);
}

// scipy.signal.firwin(81, 1/4, window=("kaiser", 5.0)) * 4 — the filter
// resample_poly(x, 4, 1) builds (half_len = 10 * 4).
function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

export function oversampleFilter(factor = 4) {
  const taps = 2 * 10 * factor + 1;
  const cutoff = 1 / factor;
  const beta = 5.0;
  const m = (taps - 1) / 2;
  const h = new Float64Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - m;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x);
    const r = (2 * i) / (taps - 1) - 1;
    const w = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / besselI0(beta);
    h[i] = cutoff * sinc * w;
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] = (h[i] / sum) * factor;
  return h;
}

// Max |sample| of the 4x band-limited signal. Polyphase: output sample
// m = 4i + p (delay-compensated by half the filter) only touches input
// samples where (m + delay - k) is a multiple of 4.
export function truePeakDb(channels, factor = 4) {
  const h = oversampleFilter(factor);
  const delay = (h.length - 1) / 2;
  // phases[p] = taps used for output phase p, as (inputOffset, coeff) pairs.
  const phases = [];
  for (let p = 0; p < factor; p++) {
    const offs = [], coefs = [];
    for (let k = 0; k < h.length; k++) {
      const t = p + delay - k; // position in the zero-stuffed signal, relative to 4i
      if (((t % factor) + factor) % factor !== 0) continue;
      offs.push(Math.round(t / factor));
      coefs.push(h[k]);
    }
    phases.push({ offs: Int32Array.from(offs), coefs: Float64Array.from(coefs) });
  }
  let reach = 0;
  for (const { offs } of phases) for (const o of offs) reach = Math.max(reach, Math.abs(o));
  let peak = 0;
  for (const x of channels) {
    const n = x.length;
    for (let i = 0; i < n; i++) {
      // Bounds checks only where the filter hangs off either end.
      const edge = i < reach || i >= n - reach;
      for (let p = 0; p < factor; p++) {
        const { offs, coefs } = phases[p];
        let acc = 0;
        if (edge) {
          for (let k = 0; k < offs.length; k++) {
            const idx = i + offs[k];
            if (idx >= 0 && idx < n) acc += coefs[k] * x[idx];
          }
        } else {
          for (let k = 0; k < offs.length; k++) acc += coefs[k] * x[i + offs[k]];
        }
        const a = acc < 0 ? -acc : acc;
        if (a > peak) peak = a;
      }
    }
  }
  return 20 * Math.log10(Math.max(peak, 1e-12));
}

// Engine convention (_load_audio): mono is duplicated to stereo, >2
// channels are downmixed — callers pass 1 or 2 channels here.
export function measureLoudness(channels, rate) {
  const stereo = channels.length === 1 ? [channels[0], channels[0]] : channels.slice(0, 2);
  const lra = loudnessRange(stereo, rate);
  return {
    integrated_lufs: integratedLoudness(stereo, rate),
    true_peak_db: truePeakDb(stereo),
    loudness_range_lu: Number.isFinite(lra) ? lra : 0,
  };
}
