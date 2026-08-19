// Creates the 2 Polar subscription products the pricing model needs —
// no one-time products at all anymore, everything is plan-gated (see
// PRICING.md). Run once per environment (sandbox, then again for
// production with POLAR_ENVIRONMENT=production).
//
// Usage:
//   POLAR_ACCESS_TOKEN=... POLAR_ENVIRONMENT=production node scripts/seed-polar-products.js
//
// Prints each created product's ID — paste those into .env as
// POLAR_PLAN_STUDIO_PRODUCT_ID / POLAR_PLAN_PRO_PRODUCT_ID.
// Re-running this creates duplicates (Polar has no "upsert by name") —
// only run it once per environment, or delete the old ones in the
// dashboard first if you need to redo it. If you're migrating off an
// older product model (a plain "All-Access" subscription, one-time master/
// chords/stem credits), archive those in the Polar dashboard — this
// script doesn't touch them.
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
        "50 full-length masters a month (Standard & Professional), stem separation included. Everything the Free plan has, plus unlimited-feeling mastering headroom for regular use.",
      recurringInterval: "month",
      prices: fixedPrice(9.99),
    },
  },
  {
    envVar: "POLAR_PLAN_PRO_PRODUCT_ID",
    body: {
      name: "All-Access",
      description:
        "250 full-length masters a month, stem separation, and unlimited chord detection. The full toolkit, 5x Studio's mastering headroom.",
      recurringInterval: "month",
      prices: fixedPrice(19.99),
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
