"use client";

// Real-time Web Audio preview chain. This is NOT the final master — the
// actual export still renders through the Python backend for full accuracy.
// This exists so parameter changes are audible instantly (server round-trips
// at 30s+ per render make "hear it live" impossible any other way).
//
// Signal path:
//   source -> highpass -> low shelf -> low-mid peak -> presence peak
//          -> high shelf -> saturation -> compressor -> [M/S width]
//          -> output gain -> safety limiter -> metering worklet -> destination

const PARAM_SMOOTH_S = 0.03; // setTargetAtTime time constant — avoids zipper noise on slider drag

function buildSaturationCurve(amount) {
  // amount: 0..1. Simple tanh waveshaper; amount scales drive.
  const n = 1024;
  const curve = new Float32Array(n);
  const drive = 1 + amount * 8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

export class LiveMasteringEngine {
  constructor(audioEl) {
    this.audioEl = audioEl;
    this.ctx = null;
    this.ready = false;
    this.onMeter = null;
    this._workletReady = false;
  }

  async init() {
    if (this.ready) return true;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return false;

    const ctx = new AudioContextCtor();
    this.ctx = ctx;

    try {
      await ctx.audioWorklet.addModule("/worklets/metering-processor.js");
      this._workletReady = true;
    } catch {
      this._workletReady = false; // metering just won't update; audio chain still works
    }

    const source = ctx.createMediaElementSource(this.audioEl);

    const highpass = new BiquadFilterNode(ctx, { type: "highpass", frequency: 30, Q: 0.7 });
    const lowShelf = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 120, gain: 0 });
    const lowMidPeak = new BiquadFilterNode(ctx, { type: "peaking", frequency: 350, Q: 1.0, gain: 0 });
    const presencePeak = new BiquadFilterNode(ctx, { type: "peaking", frequency: 2800, Q: 1.0, gain: 0 });
    const highShelf = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 8000, gain: 0 });
    const saturation = new WaveShaperNode(ctx, { curve: buildSaturationCurve(0), oversample: "4x" });
    const compressor = new DynamicsCompressorNode(ctx, { threshold: -24, ratio: 2.5, attack: 0.01, release: 0.15, knee: 6 });

    // --- Mid/Side stereo width, built from primitive nodes (native Web
    // Audio has no width control) ---
    const splitter = ctx.createChannelSplitter(2);
    const midL = new GainNode(ctx, { gain: 0.5 });
    const midR = new GainNode(ctx, { gain: 0.5 });
    const midSum = new GainNode(ctx, { gain: 1 });
    const sideL = new GainNode(ctx, { gain: 0.5 });
    const sideR = new GainNode(ctx, { gain: -0.5 });
    const sideSum = new GainNode(ctx, { gain: 1 });
    const sideWidth = new GainNode(ctx, { gain: 1 });
    const sideWidthInv = new GainNode(ctx, { gain: -1 });
    const outL = new GainNode(ctx, { gain: 1 });
    const outR = new GainNode(ctx, { gain: 1 });
    const merger = ctx.createChannelMerger(2);

    splitter.connect(midL, 0);
    splitter.connect(midR, 1);
    midL.connect(midSum);
    midR.connect(midSum);

    splitter.connect(sideL, 0);
    splitter.connect(sideR, 1);
    sideL.connect(sideSum);
    sideR.connect(sideSum);
    sideSum.connect(sideWidth);
    sideWidth.connect(sideWidthInv);

    midSum.connect(outL);
    sideWidth.connect(outL);
    midSum.connect(outR);
    sideWidthInv.connect(outR);

    outL.connect(merger, 0, 0);
    outR.connect(merger, 0, 1);

    const outputGain = new GainNode(ctx, { gain: 1 });
    // Crude real-time safety limiter for the PREVIEW only — no lookahead, so
    // it can't guarantee zero overshoot the way the backend's true-peak
    // limiter does. Good enough to keep the preview from being unlistenably
    // hot; not a substitute for the final render's limiter.
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -1.0, ratio: 20, attack: 0.001, release: 0.05, knee: 0 });

    source
      .connect(highpass)
      .connect(lowShelf)
      .connect(lowMidPeak)
      .connect(presencePeak)
      .connect(highShelf)
      .connect(saturation)
      .connect(compressor)
      .connect(splitter);

    merger.connect(outputGain).connect(limiter);

    const analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.8 });
    limiter.connect(analyser);
    analyser.connect(ctx.destination);

    if (this._workletReady) {
      const meterNode = new AudioWorkletNode(ctx, "metering-processor", { numberOfInputs: 1, numberOfOutputs: 0 });
      limiter.connect(meterNode);
      meterNode.port.onmessage = (event) => {
        if (this.onMeter) this.onMeter(event.data);
      };
      this.meterNode = meterNode;
    }

    const resumeOnPlay = () => {
      if (ctx.state === "suspended") ctx.resume();
    };
    this.audioEl.addEventListener("play", resumeOnPlay);

    this.nodes = {
      highpass,
      lowShelf,
      lowMidPeak,
      presencePeak,
      highShelf,
      saturation,
      compressor,
      sideWidth,
      outputGain,
      limiter,
      analyser,
    };
    this.ready = true;
    return true;
  }

  // params: { highpassHz, lowShelfDb, lowMidDb, presenceDb, highShelfDb,
  //           saturationAmount(0..1), compThresholdDb, compRatio,
  //           compAttackMs, compReleaseMs, width(0..2), outputGainDb,
  //           limiterCeilingDb }
  setParams(params) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const n = this.nodes;
    const smooth = (audioParam, value) => audioParam.setTargetAtTime(value, t, PARAM_SMOOTH_S);

    if (params.highpassHz != null) smooth(n.highpass.frequency, params.highpassHz);
    if (params.lowShelfDb != null) smooth(n.lowShelf.gain, params.lowShelfDb);
    if (params.lowMidDb != null) smooth(n.lowMidPeak.gain, params.lowMidDb);
    if (params.presenceDb != null) smooth(n.presencePeak.gain, params.presenceDb);
    if (params.highShelfDb != null) smooth(n.highShelf.gain, params.highShelfDb);
    if (params.saturationAmount != null) n.saturation.curve = buildSaturationCurve(params.saturationAmount);
    if (params.compThresholdDb != null) smooth(n.compressor.threshold, params.compThresholdDb);
    if (params.compRatio != null) smooth(n.compressor.ratio, params.compRatio);
    if (params.compAttackMs != null) smooth(n.compressor.attack, params.compAttackMs / 1000);
    if (params.compReleaseMs != null) smooth(n.compressor.release, params.compReleaseMs / 1000);
    if (params.width != null) smooth(n.sideWidth.gain, params.width);
    if (params.outputGainDb != null) smooth(n.outputGain.gain, 10 ** (params.outputGainDb / 20));
    if (params.limiterCeilingDb != null) smooth(n.limiter.threshold, params.limiterCeilingDb);
  }

  getSpectrum(byteArray) {
    if (!this.ready) return;
    this.nodes.analyser.getByteFrequencyData(byteArray);
  }

  destroy() {
    if (this.meterNode) this.meterNode.port.onmessage = null;
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close();
    this.ready = false;
  }
}
