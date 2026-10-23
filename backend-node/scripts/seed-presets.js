// One-time migration: writes every entry from backend/mixing_presets.json
// into Firestore's presets/{slug} collection, so the live app starts
// serving built-in presets from there (see builtinPresetsService.js)
// instead of the file. Safe to re-run — set() overwrites each doc with
// the file's current content.
//
// Usage: node scripts/seed-presets.js
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getFirestore } from "../src/config/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const presetsFile = path.resolve(__dirname, "../../backend/mixing_presets.json");

async function main() {
  const raw = JSON.parse(fs.readFileSync(presetsFile, "utf-8"));
  const presets = raw?.presets || {};
  const entries = Object.entries(presets);

  if (!entries.length) {
    console.error(`No presets found in ${presetsFile}`);
    process.exit(1);
  }

  const db = getFirestore();
  const batch = db.batch();
  for (const [slug, value] of entries) {
    batch.set(db.collection("presets").doc(slug), value);
  }
  await batch.commit();

  console.log(`Seeded ${entries.length} presets into Firestore: ${entries.map(([slug]) => slug).join(", ")}`);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
