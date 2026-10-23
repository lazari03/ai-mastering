// Measures a file's loudness on the visitor's device: decode with Web Audio
// at the engine's 44.1 kHz analysis rate, then run lib/loudness.js (a port
// of the engine's BS.1770 meter) in a worker so the page stays responsive.
// No upload, no account, no server compute.
//
// Throws LocalMeasureUnavailable when the browser can't do it (no Web
// Audio/Worker, a codec it can't decode, >2 channels the engine would
// downmix differently) — callers then fall back to the server /analyze path.

const ANALYSIS_RATE = 44100;

export class LocalMeasureUnavailable extends Error {}
export class SilentAudioError extends Error {}

async function decode(file) {
  const Ctx = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!Ctx || typeof Worker === "undefined") throw new LocalMeasureUnavailable("no web audio");
  const ctx = new Ctx(2, ANALYSIS_RATE, ANALYSIS_RATE);
  try {
    // decodeAudioData resamples to the context's rate.
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new LocalMeasureUnavailable("decode failed");
  }
}

export async function measureFileLocally(file) {
  const buffer = await decode(file);
  if (buffer.numberOfChannels > 2 || buffer.length < 0.4 * ANALYSIS_RATE) throw new LocalMeasureUnavailable("unsupported layout");
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const copy = new Float32Array(buffer.length);
    buffer.copyFromChannel(copy, c);
    channels.push(copy);
  }
  const worker = new Worker(new URL("./loudness.worker.js", import.meta.url), { type: "module" });
  try {
    const reply = await new Promise((resolve, reject) => {
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = () => reject(new LocalMeasureUnavailable("worker failed"));
      worker.postMessage({ channels, rate: ANALYSIS_RATE }, channels.map((c) => c.buffer));
    });
    if (!reply.ok) throw new LocalMeasureUnavailable(reply.error);
    if (!Number.isFinite(reply.result.integrated_lufs)) throw new SilentAudioError("silent");
    return reply.result;
  } finally {
    worker.terminate();
  }
}
