// AudioWorkletProcessor: runs on the audio render thread, computes real
// metering data per 128-sample block (peak, RMS level, L/R correlation) and
// posts it to the main thread. Throttled so it doesn't flood postMessage.
class MeteringProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.heldPeak = 0;
    this.blockCount = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;

    const left = input[0];
    const right = input[1] || left;
    const n = left.length;

    let peak = 0;
    let sumL2 = 0;
    let sumR2 = 0;
    let sumLR = 0;

    for (let i = 0; i < n; i++) {
      const l = left[i];
      const r = right[i];
      const a = Math.max(Math.abs(l), Math.abs(r));
      if (a > peak) peak = a;
      sumL2 += l * l;
      sumR2 += r * r;
      sumLR += l * r;
    }

    // Peak-hold with slow decay so the meter is readable, not flickering.
    this.heldPeak = Math.max(this.heldPeak * 0.985, peak);

    const rms = Math.sqrt((sumL2 + sumR2) / 2 / n) || 0;
    const denom = Math.sqrt(sumL2 * sumR2) || 1e-9;
    const correlation = sumLR / denom;

    this.blockCount++;
    if (this.blockCount % 8 === 0) {
      this.port.postMessage({
        peak,
        heldPeak: this.heldPeak,
        rms,
        correlation: Number.isFinite(correlation) ? correlation : 1,
      });
    }

    return true;
  }
}

registerProcessor("metering-processor", MeteringProcessor);
