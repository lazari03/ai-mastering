import fs from "node:fs";
import { execFile } from "node:child_process";

// Upload validation for MCP uploads. Never trusts the file name or the
// Content-Type: the extension must be one Auralith supports AND the bytes
// must actually look like that container. Duration is read from the header
// (WAV/AIFF/FLAC, no decoding) or ffprobe (installed in the node-api image,
// see backend-node/Dockerfile); when neither can tell, the Python engine's
// own MASTERING_MAX_DURATION_MINUTES check (mastering_service.py) still
// applies at render time.

const FAMILY_BY_EXT = {
  ".wav": "wav",
  ".aiff": "aiff",
  ".aif": "aiff",
  ".flac": "flac",
  ".mp3": "mp3",
  ".aac": "aac",
  ".m4a": "mp4",
  ".mp4": "mp4",
  ".ogg": "ogg",
  ".wma": "asf",
  ".webm": "webm",
};

const ASF_GUID = Buffer.from("3026b2758e66cf11a6d900aa0062ce6c", "hex");

// Container family from the first bytes, or null if unrecognized.
export function sniffAudioFamily(head) {
  if (!head || head.length < 12) return null;
  const ascii = (start, end) => head.subarray(start, end).toString("latin1");
  if ((ascii(0, 4) === "RIFF" || ascii(0, 4) === "RF64") && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 4) === "FORM" && (ascii(8, 12) === "AIFF" || ascii(8, 12) === "AIFC")) return "aiff";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(4, 8) === "ftyp") return "mp4";
  if (head.subarray(0, 16).equals(ASF_GUID)) return "asf";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (ascii(0, 3) === "ID3") return "id3"; // MP3 (or, rarely, ID3-tagged AAC)
  // MPEG audio / ADTS frame sync (11-12 set bits). Layer bits 00 = ADTS AAC.
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return (head[1] & 0x06) === 0 ? "aac" : "mp3";
  return null;
}

export function familyMatchesExt(family, ext) {
  const expected = FAMILY_BY_EXT[ext];
  if (!expected || !family) return false;
  if (family === expected) return true;
  if (family === "id3") return expected === "mp3" || expected === "aac";
  // A raw MPEG stream saved as .aac or ADTS saved as .mp3 both decode fine.
  if ((family === "mp3" || family === "aac") && (expected === "mp3" || expected === "aac")) return true;
  return false;
}

function wavDuration(buf) {
  // Walk RIFF chunks: fmt gives byte rate, data gives size.
  let offset = 12;
  let byteRate = null;
  let dataSize = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("latin1", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 16 <= buf.length) byteRate = buf.readUInt32LE(offset + 16);
    if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || dataSize == null || dataSize === 0xffffffff) return null; // RF64/streamed: unknown
  return dataSize / byteRate;
}

function readExtended80(buf, offset) {
  // IEEE 754 80-bit extended (AIFF sample rate).
  const exponent = buf.readUInt16BE(offset) & 0x7fff;
  const hi = buf.readUInt32BE(offset + 2);
  const lo = buf.readUInt32BE(offset + 6);
  if (exponent === 0 && hi === 0 && lo === 0) return 0;
  return (hi * 2 ** 32 + lo) * 2 ** (exponent - 16383 - 63);
}

function aiffDuration(buf) {
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("latin1", offset, offset + 4);
    const size = buf.readUInt32BE(offset + 4);
    if (id === "COMM" && offset + 26 <= buf.length) {
      const frames = buf.readUInt32BE(offset + 10);
      const rate = readExtended80(buf, offset + 16);
      return rate > 0 ? frames / rate : null;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

function flacDuration(buf) {
  // STREAMINFO is always the first metadata block, right after "fLaC".
  if (buf.length < 8 + 34) return null;
  const blockType = buf[4] & 0x7f;
  if (blockType !== 0) return null;
  const si = 8;
  const sampleRate = (buf[si + 10] << 12) | (buf[si + 11] << 4) | (buf[si + 12] >> 4);
  const totalSamples = (buf[si + 13] & 0x0f) * 2 ** 32 + buf.readUInt32BE(si + 14);
  if (!sampleRate || !totalSamples) return null;
  return totalSamples / sampleRate;
}

export function headerDuration(family, head) {
  try {
    if (family === "wav") return wavDuration(head);
    if (family === "aiff") return aiffDuration(head);
    if (family === "flac") return flacDuration(head);
  } catch {
    return null;
  }
  return null;
}

export function ffprobeDuration(filePath, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { timeout: timeoutMs },
      (error, stdout) => {
        if (error) return resolve(null);
        const value = Number(String(stdout).trim());
        resolve(Number.isFinite(value) && value > 0 ? value : null);
      },
    );
  });
}

const HEAD_BYTES = 64 * 1024;

// Validates an uploaded file on disk. Returns
//   { ok: true, family, durationS }  or  { ok: false, code, message }.
export async function validateAudioFile(filePath, ext, { maxDurationMinutes, probe = ffprobeDuration } = {}) {
  const fd = fs.openSync(filePath, "r");
  let head;
  try {
    head = Buffer.alloc(HEAD_BYTES);
    const read = fs.readSync(fd, head, 0, HEAD_BYTES, 0);
    head = head.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
  if (head.length === 0) return { ok: false, code: "empty_file", message: "The uploaded file is empty." };
  const family = sniffAudioFamily(head);
  if (!family) return { ok: false, code: "unsupported_format", message: "That file isn't a recognizable audio file (WAV, AIFF, FLAC, MP3, AAC/M4A, OGG, WMA or WebM)." };
  if (!familyMatchesExt(family, ext)) {
    return { ok: false, code: "format_mismatch", message: `The file's contents don't match its ${ext} extension. Export it again as a real ${ext.slice(1).toUpperCase()} file.` };
  }
  let durationS = headerDuration(family, head);
  if (durationS == null) durationS = await probe(filePath);
  if (durationS != null) {
    if (durationS < 1) return { ok: false, code: "too_short", message: "The track is shorter than one second — there is nothing to master." };
    if (maxDurationMinutes && durationS > maxDurationMinutes * 60) {
      return {
        ok: false,
        code: "too_long",
        message: `This track is ${(durationS / 60).toFixed(1)} minutes long; the limit is ${maxDurationMinutes} minutes. Trim it, or split a long mix into separate songs.`,
      };
    }
  }
  return { ok: true, family, durationS };
}
