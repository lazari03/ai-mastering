import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

// POSTs a FormData body to the Python DSP service and waits as long as a
// render can legitimately take.
//
// Why not global fetch: Node's fetch (undici) aborts any request whose
// response headers haven't arrived within 300 s (UND_ERR_HEADERS_TIMEOUT,
// measured: "fetch failed after 301 s"), and the Python service only sends
// headers once the master is finished. An 8-minute track measured 284 s
// to render on the dev container, so longer tracks and stem jobs on the
// production VPS failed at exactly 5 minutes: the user got an error (and a
// refund) while Python kept rendering a master nobody would download. The
// browser already waits 20 minutes (frontend client.js MASTERING_TIMEOUT_MS);
// this hop now waits one minute less, so the gateway answers before the
// browser gives up. Configuring fetch's timeout needs an undici Agent from
// the npm package, which is not guaranteed compatible with the undici Node
// bundles, so this uses node:http and the platform's own multipart encoder
// (new Response(form)) instead: same wire format, no new dependency.
export const UPSTREAM_TIMEOUT_MS = Number(process.env.PYTHON_UPSTREAM_TIMEOUT_MS || 19 * 60 * 1000);

export class UpstreamTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Mastering took longer than ${Math.round(timeoutMs / 60000)} minutes and was stopped. Try a shorter file, or try again when the server is less busy.`);
    this.name = "UpstreamTimeoutError";
    this.status = 504;
    this.code = "processing_timeout";
  }
}

export async function postFormData(url, form, { timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  // Streamed, not buffered: the encoded multipart body is never held in
  // memory as a whole (uploads go up to 200 MB). Sent chunked, which
  // uvicorn accepts like any HTTP/1.1 server.
  const encoded = new Response(form);
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method: "POST",
        headers: { "content-type": encoded.headers.get("content-type") },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          const text = Buffer.concat(chunks).toString("utf8");
          const isJson = String(res.headers["content-type"] || "").includes("application/json");
          let json = null;
          if (isJson) {
            try {
              json = JSON.parse(text);
            } catch {
              json = {};
            }
          }
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, isJson, json });
        });
        res.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      },
    );
    // One deadline for the whole exchange (headers AND body), not an idle
    // timeout: a render sends nothing until it is done.
    const timer = setTimeout(() => {
      req.destroy(new UpstreamTimeoutError(timeoutMs));
    }, timeoutMs);
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    const body = Readable.fromWeb(encoded.body);
    body.on("error", (error) => req.destroy(error));
    body.pipe(req);
  });
}
