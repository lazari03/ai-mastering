// Makes sure every product the pricing model sells exists in Polar, and
// prints the env vars that point the backend at them. Safe to re-run:
// each product is tagged with metadata.auralith_key, so a second run finds
// what the first one made instead of creating duplicates.
//
//   Plans (recurring):  Indie, Studio, All-Access — each monthly AND yearly
//   One-time:           Single Master, Stem Separation
//
// Prices mirror frontend/src/lib/pricing.js (yearly = monthly × 10, "two
// months free"). If you change a price there, change it here too — this
// script never edits the price of a product that already exists (that
// would move live subscribers); it reports the mismatch instead so you can
// decide in the Polar dashboard.
//
// Usage (from backend-node/):
//   POLAR_ACCESS_TOKEN=... node scripts/seed-polar-products.js               # sandbox
//   POLAR_ACCESS_TOKEN=... POLAR_ENVIRONMENT=production node scripts/seed-polar-products.js
//   ... --dry-run   # show what would be created, change nothing
//
// A product you already created by hand is adopted rather than duplicated
// when its ID is already in the matching env var (e.g.
// POLAR_PLAN_STUDIO_PRODUCT_ID) — it just gets the metadata tag added.
import "dotenv/config";
import { Polar } from "@polar-sh/sdk";

const accessToken = process.env.POLAR_ACCESS_TOKEN;
if (!accessToken) {
  console.error("Set POLAR_ACCESS_TOKEN first (an Organization Access Token with products:read and products:write).");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const server = process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox";
const polar = new Polar({ accessToken, server });

// EUR — this Polar organization's default presentment currency (Polar
// rejects prices that don't include it).
const CURRENCY = "eur";
const cents = (eur) => Math.round(eur * 100);

const PLAN_TIERS = [
  {
    key: "planIndie",
    env: "POLAR_PLAN_INDIE",
    name: "Indie",
    monthly: 4.99,
    description: "15 full-length masters a month on the Standard engine, with codec preview and instant A/B.",
  },
  {
    key: "planStudio",
    env: "POLAR_PLAN_STUDIO",
    name: "Studio",
    monthly: 9.99,
    description: "50 full-length masters a month on the Standard and Professional engines.",
  },
  {
    key: "planPro",
    env: "POLAR_PLAN_PRO",
    name: "All-Access",
    monthly: 19.99,
    description: "250 full-length masters a month, everything in Studio, 20 stem separations a month and shareable download links.",
  },
];

const CATALOG = [
  ...PLAN_TIERS.flatMap((tier) => [
    {
      key: tier.key,
      envVar: `${tier.env}_PRODUCT_ID`,
      name: `${tier.name} (Monthly)`,
      description: tier.description,
      interval: "month",
      amount: cents(tier.monthly),
    },
    {
      key: `${tier.key}Annual`,
      envVar: `${tier.env}_ANNUAL_PRODUCT_ID`,
      name: `${tier.name} (Yearly)`,
      description: `${tier.description} Billed yearly — 12 months for the price of 10.`,
      interval: "year",
      amount: cents(tier.monthly) * 10,
    },
  ]),
  {
    key: "singleMaster",
    envVar: "POLAR_SINGLE_MASTER_PRODUCT_ID",
    name: "Single Master",
    description: "One extra full-length master, no subscription. Same Standard/Professional engine as your plan.",
    interval: null,
    amount: cents(2.99),
  },
  {
    key: "stemSeparation",
    envVar: "POLAR_STEM_SEPARATION_PRODUCT_ID",
    name: "Stem Separation",
    description: "One stem-separated master (vocals and accompaniment, rebalanced separately). Included on All-Access, 20/month.",
    interval: null,
    amount: cents(4.99),
  },
];

async function listActiveProducts() {
  const products = [];
  const pages = await polar.products.list({ isArchived: false, limit: 100 });
  for await (const page of pages) products.push(...page.result.items);
  return products;
}

function fixedAmount(product) {
  const price = (product.prices || []).find((p) => p.amountType === "fixed" && !p.isArchived);
  return price ? { amount: price.priceAmount, currency: price.priceCurrency } : null;
}

function describeMismatch(entry, product) {
  const problems = [];
  if ((product.recurringInterval || null) !== entry.interval) {
    problems.push(`billing interval is ${product.recurringInterval || "one-time"}, expected ${entry.interval || "one-time"}`);
  }
  const price = fixedAmount(product);
  if (!price) problems.push("has no fixed price");
  else if (price.amount !== entry.amount || price.currency !== CURRENCY) {
    problems.push(`price is ${(price.amount / 100).toFixed(2)} ${price.currency}, expected ${(entry.amount / 100).toFixed(2)} ${CURRENCY}`);
  }
  return problems;
}

async function main() {
  console.log(`Polar ${server}${dryRun ? " (dry run)" : ""}\n`);
  const existing = await listActiveProducts();
  const envLines = [];
  const warnings = [];

  for (const entry of CATALOG) {
    let product =
      existing.find((p) => p.metadata?.auralith_key === entry.key) ||
      existing.find((p) => process.env[entry.envVar] && p.id === process.env[entry.envVar]);
    let action = "exists";

    if (product && product.metadata?.auralith_key !== entry.key) {
      action = "adopted";
      if (!dryRun) {
        product = await polar.products.update({
          id: product.id,
          productUpdate: { metadata: { ...(product.metadata || {}), auralith_key: entry.key } },
        });
      }
    }

    if (!product) {
      action = "created";
      const body = {
        name: entry.name,
        description: entry.description,
        prices: [{ amountType: "fixed", priceAmount: entry.amount, priceCurrency: CURRENCY }],
        metadata: { auralith_key: entry.key },
        ...(entry.interval ? { recurringInterval: entry.interval } : {}),
      };
      product = dryRun ? { id: "(would be created)" } : await polar.products.create(body);
    } else {
      for (const problem of describeMismatch(entry, product)) warnings.push(`${entry.name} (${product.id}): ${problem}`);
    }

    const price = `${(entry.amount / 100).toFixed(2)} EUR${entry.interval ? ` / ${entry.interval}` : " one-time"}`;
    console.log(`${action.padEnd(8)} ${entry.name.padEnd(22)} ${price.padEnd(22)} ${product.id}`);
    envLines.push(`${entry.envVar}=${product.id}`);
  }

  if (warnings.length) {
    console.log("\nCheck these in the Polar dashboard (not changed automatically):");
    for (const w of warnings) console.log(`  - ${w}`);
  }
  console.log("\nSet these in the backend's environment (.env / docker-compose):\n");
  console.log(envLines.join("\n"));
}

main().catch((error) => {
  console.error("Failed:", error?.message || error);
  process.exit(1);
});
