// Creates the 3 Polar products the pricing model needs (2 subscription
// plans + 1 one-time credit) instead of clicking through the dashboard —
// run once per environment (sandbox, then again for production with
// POLAR_ENVIRONMENT=production).
//
// Usage:
//   POLAR_ACCESS_TOKEN=... POLAR_ENVIRONMENT=production node scripts/seed-polar-products.js
//
// Prints each created product's ID — paste those into .env as
// POLAR_PLAN_STUDIO_PRODUCT_ID / POLAR_PLAN_PRO_PRODUCT_ID / POLAR_CHORDS_PRODUCT_ID.
// Re-running this creates duplicates (Polar has no "upsert by name") —
// only run it once per environment, or delete the old ones in the
// dashboard first if you need to redo it. If you're migrating off the old
// 5-product model, archive POLAR_SUBSCRIPTION_PRODUCT_ID /
// POLAR_MASTER_STANDARD_PRODUCT_ID / POLAR_MASTER_PROFESSIONAL_PRODUCT_ID /
// POLAR_STEM_ADDON_PRODUCT_ID in the Polar dashboard — this script doesn't
// touch them.
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
    envVar: "POLAR_PLAN_STUDIO_PRODUCT_ID",
    body: {
      name: "Studio",
      description:
        "Unlimited full-length Standard & Professional mastering, stem separation included. Everything the Free plan has, plus unlimited mastering and stems.",
      recurringInterval: "month",
      prices: fixedPrice(9.99),
    },
  },
  {
    envVar: "POLAR_PLAN_PRO_PRODUCT_ID",
    body: {
      name: "All-Access",
      description:
        "Everything Studio has, plus unlimited chord detection. The full toolkit, nothing metered.",
      recurringInterval: "month",
      prices: fixedPrice(19.99),
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
