import { measureLoudness } from "./loudness";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: measureLoudness(data.channels, data.rate) });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message || error) });
  }
};
