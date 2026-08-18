// Creates all 5 Polar products via API instead of clicking through the
// dashboard five times — run once per environment (sandbox, then again
// for production with POLAR_ENVIRONMENT=production).
//
// Usage:
//   POLAR_ACCESS_TOKEN=... POLAR_ENVIRONMENT=production node scripts/seed-polar-products.js
//
// Prints each created product's ID — paste those into .env as
// POLAR_SUBSCRIPTION_PRODUCT_ID / POLAR_MASTER_STANDARD_PRODUCT_ID / etc.
// Re-running this creates duplicates (Polar has no "upsert by name") —
// only run it once per environment, or delete the old ones in the
// dashboard first if you need to redo it.
import "dotenv/config";
import { Polar } from "@polar-sh/sdk";

const accessToken = process.env.POLAR_ACCESS_TOKEN;
if (!accessToken) {
  console.error("Set POLAR_ACCESS_TOKEN first.");
  process.exit(1);
}

const server = process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox";
const polar = new Polar({ accessToken, server });

// EUR — matches this Polar organization's default presentment currency
// (Polar rejects prices that don't include the org's default currency).
const fixedPrice = (eur) => [{ amountType: "fixed", priceAmount: Math.round(eur * 100), priceCurrency: "eur" }];

const PRODUCTS = [
  {
    envVar: "POLAR_SUBSCRIPTION_PRODUCT_ID",
    body: {
      name: "All-Access",
      description:
        "Unlimited full-length Standard & Professional mastering, unlimited chord detection, and stem separation included — one subscription, everything unlocked.",
      recurringInterval: "month",
      prices: fixedPrice(19),
    },
  },
  {
    envVar: "POLAR_MASTER_STANDARD_PRODUCT_ID",
    body: {
      name: "Standard Master",
      description:
        "One full-length master on the Standard adaptive DSP engine — EQ, compression, saturation, stereo imaging, and loudness-safe limiting tuned to your genre.",
      prices: fixedPrice(2.99),
    },
  },
  {
    envVar: "POLAR_MASTER_PROFESSIONAL_PRODUCT_ID",
    body: {
      name: "Professional Master",
      description:
        "One full-length master on the Professional engine — adds oversampled true-peak limiting, finer dynamic EQ, and tempo-aware compression for release-grade results.",
      prices: fixedPrice(4.99),
    },
  },
  {
    envVar: "POLAR_CHORDS_PRODUCT_ID",
    body: {
      name: "Chord Detection",
      description: "One full chord, key, and BPM analysis with synced playback so you can follow the progression in real time.",
      prices: fixedPrice(1.49),
    },
  },
  {
    envVar: "POLAR_STEM_ADDON_PRODUCT_ID",
    body: {
      name: "Stem Separation Add-on",
      description:
        "Adds stem-aware processing to your next master — vocals, drums, bass, and other elements split and processed independently for more precise results.",
      prices: fixedPrice(1.99),
    },
  },
];

async function main() {
  console.log(`Creating products on Polar (${server})...\n`);
  const results = [];
  for (const { envVar, body } of PRODUCTS) {
    const product = await polar.products.create(body);
    console.log(`${body.name}: ${product.id}`);
    results.push(`${envVar}=${product.id}`);
  }
  console.log("\nPaste these into .env:\n");
  console.log(results.join("\n"));
}

main().catch((error) => {
  console.error("Failed:", error?.message || error);
  process.exit(1);
});
