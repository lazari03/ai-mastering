// Creates the Polar products the pricing model needs — 2 recurring
// subscriptions plus 1 one-time purchase (see PRICING.md). Run once per
// environment (sandbox, then again for production with
// POLAR_ENVIRONMENT=production).
//
// Usage:
//   POLAR_ACCESS_TOKEN=... POLAR_ENVIRONMENT=production node scripts/seed-polar-products.js
//
// Prints each created product's ID — paste those into .env as
// POLAR_PLAN_STUDIO_PRODUCT_ID / POLAR_PLAN_PRO_PRODUCT_ID /
// POLAR_SINGLE_MASTER_PRODUCT_ID.
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
  {
    envVar: "POLAR_SINGLE_MASTER_PRODUCT_ID",
    body: {
      // No recurringInterval at all — that's what makes this a one-time
      // purchase instead of a subscription (see ProductCreateOneTime vs
      // ProductCreateRecurring in the SDK's own types).
      name: "Single Master",
      description:
        "One extra full-length master, no subscription. For a one-off track once your monthly plan quota is used up.",
      prices: fixedPrice(2.99),
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
