// Cuts the first `seconds` of a WAV file on the device, without decoding
// it — the PCM bytes are sliced as-is and wrapped in a fresh header, so the
// result is bit-identical to what the backend's own preview truncation
// (`ffmpeg -t 30` in masteringRoutes.js) keeps. A free preview only ever
// uses those 30 seconds, so uploading the whole file for it was pure wasted
// bandwidth: a 4-minute 24-bit WAV is ~60 MB, its first 30 s is ~8 MB.
//
// Returns null for anything that isn't a plain RIFF/WAVE file (or is
// already short) — callers upload the original file in that case.

const HEADER_SCAN_BYTES = 1024 * 1024; // chunks before "data" (fmt, LIST, bext, iXML…) live here

function fourCC(view, offset) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

export async function sliceWavHead(file, seconds) {
  if (!file || typeof file.slice !== "function") return null;
  let view;
  try {
    view = new DataView(await file.slice(0, Math.min(file.size, HEADER_SCAN_BYTES)).arrayBuffer());
  } catch {
    return null;
  }
  if (view.byteLength < 12 || fourCC(view, 0) !== "RIFF" || fourCC(view, 8) !== "WAVE") return null;

  let fmt = null;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = fourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (body + 16 > view.byteLength) return null;
      fmt = { start: offset, end: body + size + (size % 2) };
    } else if (id === "data") {
      if (!fmt) return null;
      const blockAlign = view.getUint16(fmt.start + 8 + 12, true);
      const byteRate = view.getUint32(fmt.start + 8 + 8, true);
      if (!blockAlign || !byteRate) return null;
      const available = Math.min(size, file.size - body);
      let keep = Math.floor((byteRate * seconds) / blockAlign) * blockAlign;
      if (keep >= available) return null; // already short enough
      keep = Math.max(blockAlign, keep);

      // RIFF header + the original fmt chunk (keeps extensible/float
      // formats intact) + a data chunk sized to the excerpt.
      const fmtBytes = new Uint8Array(view.buffer, fmt.start, fmt.end - fmt.start);
      const header = new ArrayBuffer(12 + fmtBytes.length + 8);
      const out = new DataView(header);
      const bytes = new Uint8Array(header);
      bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
      out.setUint32(4, 4 + fmtBytes.length + 8 + keep, true);
      bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
      bytes.set(fmtBytes, 12);
      const dataAt = 12 + fmtBytes.length;
      bytes.set([0x64, 0x61, 0x74, 0x61], dataAt); // data
      out.setUint32(dataAt + 4, keep, true);

      const name = file.name || "audio.wav";
      return new File([header, file.slice(body, body + keep)], name, { type: file.type || "audio/wav" });
    }
    offset = body + size + (size % 2);
  }
  return null;
}
