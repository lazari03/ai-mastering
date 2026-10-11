// Test-only ESM loader: resolves the "@/" alias to src/ (with extension
// probing) and swaps the network/auth/entitlement/analytics modules for
// recording stubs, so the REAL store + masteringDomain run under node:test.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const STUBS = {
  "@/network/http/client": "stubs/client.mjs",
  "@/store/authStore": "stubs/authStore.mjs",
  "@/store/entitlementsStore": "stubs/entitlementsStore.mjs",
  "@/lib/analytics": "stubs/analytics.mjs",
};
const here = path.dirname(fileURLToPath(import.meta.url));

function probe(base) {
  for (const cand of [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: pathToFileURL(path.join(here, STUBS[specifier])).href, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const hit = probe(path.join(SRC, specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const hit = probe(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}
