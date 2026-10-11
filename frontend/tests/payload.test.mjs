// Wiring regression: drives the REAL masteringStore + masteringDomain
// (network stubbed, see loader.mjs) through representative selections and
// compares the exact multipart payload to payload.golden.json (captured on
// the pre-redesign code). Run: npm test   (UPDATE_GOLDEN=1 to re-capture)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(here, "payload.golden.json");
const { useMasteringStore, DEFAULT_PRO_PARAMS } = await import("../src/store/masteringStore.js");
const { calls } = await import("./stubs/client.mjs");

const initial = useMasteringStore.getState();
const audio = () => new File([new Uint8Array(16)], "song.wav", { type: "audio/wav" });
const ref = () => new File([new Uint8Array(8)], "ref.wav", { type: "audio/wav" });

const PRESETS = [
  { name: "builtin_dir", display_name: "Built-in", kind: "direction", genre: "rock", style: "modern", tags: ["punchier_drums", "warmer"], tweaks: { punch: 0.6, warmth: 0.6 } },
  { name: "user_merged", display_name: "User", custom: true, kind: "settings", genre: "edm", style: "rock_modern", tags: ["louder", "wider", "better_vocals"], tweaks: { loudness: 0.4 }, category: "club", flavour: "deep", use_stem_separation: false },
  { name: "chain_one", display_name: "Chain", custom: true, kind: "chain", genre: "pop", style: "modern", tags: [], processing: { limiter: { target_lufs_i: -9, ceiling_dbtp: -1 } } },
];

function fresh() {
  useMasteringStore.setState({ ...initial, genres: ["pop", "rock", "edm"], presets: PRESETS, selectedGenre: "pop", selectedStyle: "modern", file: audio() }, true);
  calls.length = 0;
  return useMasteringStore.getState();
}

function serialize(fd) {
  const out = [];
  for (const [k, v] of fd.entries()) {
    out.push([k, typeof v === "string" ? v : { file: v.name, size: v.size, type: v.type }]);
  }
  return out;
}

const act = (name, ...args) => useMasteringStore.getState()[name](...args);

const SCENARIOS = {
  default: () => {},
  genre_rock: () => act("setGenre", "rock"),
  // kept controls
  K1_loudness_up: () => act("setTweak", "loudness", 1),
  K1_loudness_down: () => act("setTweak", "loudness", -1),
  K2_style_open: () => act("setStyle", "acoustic_natural"),
  K2_style_dense: () => act("setStyle", "electronic_modern"),
  K2_style_vintage: () => act("setStyle", "vintage_analog"),
  K3_punch: () => act("setTweak", "punch", 0.7),
  K4_low_end: () => act("setTweak", "low_end", -0.5),
  K5_warmth: () => act("setTweak", "warmth", 1),
  K6_brightness: () => act("setTweak", "brightness", 0.5),
  K7_presence: () => act("setTweak", "presence", 0.9),
  K8_clarity: () => act("toggleTag", "clearer"),
  K9_width: () => act("setTweak", "width", 0.65),
  K10_delivery_streaming: () => act("setDelivery", "streaming"),
  K10_delivery_apple: () => act("setDelivery", "apple"),
  K10_delivery_loud: () => act("setDelivery", "loud"),
  all_kept_on: () => {
    act("setGenre", "edm"); act("setStyle", "electronic_modern"); act("setDelivery", "loud");
    for (const [k, v] of Object.entries({ loudness: 0.5, punch: 0.4, low_end: 0.3, warmth: -0.2, brightness: 0.6, presence: 0.2, width: 0.8 })) act("setTweak", k, v);
    act("toggleTag", "clearer");
  },
  // merged controls (state kept, no UI chips)
  merged_tags: () => { act("toggleTag", "louder"); act("toggleTag", "softer"); act("toggleTag", "deeper"); },
  merged_category_flavour: () => { act("setCategory", "warm"); act("setFlavour", "analog"); },
  merged_style_cd: () => act("setStyle", "cd_loudness_war"),
  preset_builtin: () => act("setPreset", "builtin_dir"),
  preset_user_with_merged: () => act("setPreset", "user_merged"),
  preset_chain: () => act("setPreset", "chain_one"),
  direction_warm_strong_loud: () => act("setDirection", { tone: "warm", intensity: "strong", loudness: "loud" }),
  tier_professional_stems: () => { act("setTier", "professional"); act("setUseStemSeparation", true); },
  reference_mode: () => { act("toggleTag", "warmer"); act("setReferenceFile", ref()); act("setGenre", ""); act("setStyle", ""); },
  pro_mode: () => {
    act("setMode", "pro");
    act("setProSection", "limiter", { target_lufs_i: -9 });
    act("updateProBand", "eq", 0, { gain_db: 1.5 });
  },
  pro_mode_with_category: () => { act("setCategory", "club"); act("setMode", "pro"); },
};

async function payloadFor(name, preview) {
  fresh();
  SCENARIOS[name]();
  await act("submit", preview);
  assert.equal(calls.length, 1, `${name}: exactly one /master request`);
  assert.equal(useMasteringStore.getState().error, "", `${name}: no error`);
  return serialize(calls[0]);
}

const actual = {};
for (const name of Object.keys(SCENARIOS)) {
  test(`payload ${name}`, async () => {
    actual[name] = { master: await payloadFor(name, false) };
    if (["default", "K5_warmth", "reference_mode", "pro_mode", "preset_user_with_merged"].includes(name)) {
      actual[name].preview = await payloadFor(name, true);
    }
    if (process.env.UPDATE_GOLDEN) return;
    const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
    assert.deepEqual(actual[name], golden[name]);
  });
}

test("golden covers exactly the scenarios", () => {
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  assert.deepEqual(Object.keys(golden).sort(), Object.keys(SCENARIOS).sort());
});

test("defaults of hidden/merged state are unchanged", () => {
  const s = fresh();
  assert.deepEqual(s.selectedTags, []);
  assert.equal(s.selectedCategory, "");
  assert.equal(s.selectedFlavour, "");
  assert.equal(s.selectedStyle, "modern");
  assert.equal(s.selectedDelivery, "auto");
  assert.equal(s.tier, "standard");
  assert.equal(s.mode, "quick");
  assert.deepEqual(s.proParams, DEFAULT_PRO_PARAMS);
});
