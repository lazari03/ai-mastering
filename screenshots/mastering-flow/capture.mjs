/**
 * Captures the mastering flow end to end, one screenshot per step, for
 * use as video stills.
 *
 * Runs against the LOCAL stack (frontend :3000, node :8000, python :8001)
 * and signs in anonymously the same way the public tools do — so it needs
 * no credentials and creates no real account.
 *
 *   node screenshots/mastering-flow/capture.mjs [path-to-audio]
 *
 * Output: screenshots/mastering-flow/NN-name.png
 */
import { chromium } from "/Users/fonzi/.npm/_npx/6bcb61ec6d5aea22/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));
const AUDIO = resolve(process.argv[2] || "/tmp/demo-track.wav");
const BASE = process.env.BASE_URL || "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

let n = 0;
const shot = async (page, name, { full = false } = {}) => {
  n += 1;
  const file = `${OUT}/${String(n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: full });
  console.log(`  ${String(n).padStart(2, "0")}  ${name}${full ? " (full page)" : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));

const dismissCookies = async () => {
  await page.getByRole("button", { name: /accept/i }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
};

console.log(`capturing from ${BASE} using ${AUDIO}\n`);

// 1 — the landing page a visitor actually arrives on
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("main");
await dismissCookies();
await page.waitForTimeout(1200);
await shot(page, "landing-hero");

// Anonymous sign-in happens on the public tool pages (authStore.ensureAnonymous),
// which is what gives the Studio a session without an account.
await page.goto(`${BASE}/lufs-meter`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

// 2 — Studio, step 1: nothing chosen yet
await page.goto(`${BASE}/app?tab=master`, { waitUntil: "domcontentloaded" });
// state:"attached" — the real input is class="hidden" behind a styled
// dropzone, so waiting for visibility never resolves. setInputFiles works
// on a hidden input, which is the normal pattern for custom file UIs.
await page.waitForSelector('input[type="file"]', { state: "attached" });
await page.getByRole("button", { name: /3\. MASTER|1\. AUDIO/i }).first().waitFor({ timeout: 30000 }).catch(() => {});
await dismissCookies();
await page.waitForTimeout(2500);

// First visit shows the onboarding tour as a full-screen modal. Worth a
// still of its own (it IS part of the first-run experience), then skip it
// — it sits at z-50 and swallows every click behind it.
const tour = await page.$(".fixed.inset-0.z-50");
if (tour) {
  await shot(page, "studio-onboarding-tour");
  await page.getByRole("button", { name: /^skip$/i }).click().catch(() => {});
  await page.waitForTimeout(1200);
}

await shot(page, "studio-step1-choose-audio");

// 3 — file attached
await page.setInputFiles('input[type="file"] >> nth=0', AUDIO);
await page.waitForTimeout(2500);
await shot(page, "studio-step1-file-selected");

// 4 — step 2: mastering mode
await page.getByRole("main").getByRole("button", { name: /^next$/i }).first().click();
await page.waitForTimeout(2000);
await shot(page, "studio-step2-mode");

// 5 — step 3: ready to render
await page.getByRole("main").getByRole("button", { name: /^next$/i }).first().click();
await page.waitForTimeout(2000);
await shot(page, "studio-step3-ready");

// 6 — the render itself. The master button is whatever primary action
// step 3 exposes; match generously so a copy change doesn't break capture.
// Scoped to <main> and matched exactly: an unscoped /master .../ regex
// also matches the sidebar's "Master Audio" nav link, and .first() picked
// THAT — so the capture silently navigated instead of rendering, and the
// "in progress" still was really just step 3 again.
const masterBtn = page.getByRole("main").getByRole("button", { name: /^master track$/i });
await masterBtn.click({ timeout: 15000 });
await page.waitForTimeout(2500);
await shot(page, "mastering-in-progress");

// 7 — wait for the result view. The job can take 10-30s; poll for the
// A/B player rather than guessing a fixed delay.
const ready = await page
  .waitForSelector('[aria-label="Compare"]', { timeout: 300000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(4000);
await shot(page, ready ? "result-before-after" : "result-timeout");

// 8 — the whole result page, for stills of the metrics/processing detail
await shot(page, "result-full-page", { full: true });

// 9 — the "after" side of the A/B selected
await page.getByRole("radio", { name: /after/i }).click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1500);
await shot(page, "result-after-selected");

console.log(`\n${n} screenshots -> ${OUT}`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
