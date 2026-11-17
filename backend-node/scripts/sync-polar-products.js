// Update existing product copy only. Never creates products, changes prices,
// archives anything, or touches subscriptions. Default mode is read-only.
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Polar } from "@polar-sh/sdk";
import { POLAR_CATALOG } from "./polar-catalog.js";

class CatalogSyncError extends Error {}

function validate(entry, product) {
  if (!product || product.isArchived) throw new CatalogSyncError(`${entry.name}: configured product missing or archived`);
  if ((product.recurringInterval || null) !== entry.interval ||
      (product.recurringIntervalCount != null && product.recurringIntervalCount !== 1)) {
    throw new CatalogSyncError(`${entry.name}: billing interval mismatch; nothing will reprice subscriptions`);
  }
  const fixed = (product.prices || []).filter((p) => !p.isArchived);
  if (fixed.length !== 1 || fixed[0].amountType !== "fixed" ||
      fixed[0].priceAmount !== entry.amount || fixed[0].priceCurrency !== "eur") {
    throw new CatalogSyncError(`${entry.name}: live price differs from the website; manual review required`);
  }
  if (product.metadata?.auralith_key && product.metadata.auralith_key !== entry.key) {
    throw new CatalogSyncError(`${entry.name}: product mapping conflict`);
  }
}

async function listProducts(polar) {
  const products = [];
  const pages = await polar.products.list({ isArchived: false, limit: 100 });
  for await (const page of pages) products.push(...page.result.items);
  return products;
}

export async function syncPolarCatalog({ polar, env, apply = false, log = () => {} }) {
  const ids = POLAR_CATALOG.map((entry) => env[entry.envVar]?.trim());
  if (ids.some((id) => !id)) throw new CatalogSyncError("All eight existing Polar product IDs must be configured");
  if (new Set(ids).size !== ids.length) throw new CatalogSyncError("Polar product IDs must be distinct");
  const products = await listProducts(polar);
  // Validate the entire catalog BEFORE the first write.
  const planned = POLAR_CATALOG.map((entry, index) => {
    const product = products.find((p) => p.id === ids[index]);
    validate(entry, product);
    return { entry, product };
  });
  let changed = 0;
  for (const { entry, product } of planned) {
    if (product.name === entry.name && product.description === entry.description) continue;
    if (apply) {
      await polar.products.update({
        id: product.id,
        productUpdate: { name: entry.name, description: entry.description },
      });
    }
    changed++;
    log(`${apply ? "Updated" : "Would update"}: ${entry.name}`);
  }
  if (apply) {
    const after = await listProducts(polar);
    for (const { entry, product } of planned) {
      const actual = after.find((p) => p.id === product.id);
      validate(entry, actual);
      if (actual.name !== entry.name || actual.description !== entry.description) {
        throw new CatalogSyncError(`${entry.name}: copy verification failed; rerun is safe`);
      }
    }
  }
  return { verified: planned.length, changed, applied: apply };
}

async function main() {
  const env = process.env;
  if (!env.POLAR_ACCESS_TOKEN) throw new CatalogSyncError("POLAR_ACCESS_TOKEN is not configured on the server");
  if (!["production", "sandbox"].includes(env.POLAR_ENVIRONMENT)) {
    throw new CatalogSyncError("POLAR_ENVIRONMENT must explicitly be production or sandbox");
  }
  if (process.argv.includes("--production-only") && env.POLAR_ENVIRONMENT !== "production") {
    throw new CatalogSyncError("Refusing release sync against a sandbox Polar account");
  }
  const polar = new Polar({ accessToken: env.POLAR_ACCESS_TOKEN, server: env.POLAR_ENVIRONMENT });
  const result = await syncPolarCatalog({
    polar, env, apply: process.argv.includes("--apply"), log: (line) => console.log(line),
  });
  console.log(`Polar ${env.POLAR_ENVIRONMENT}: ${result.verified} products verified; ${result.changed} ${result.applied ? "updated" : "planned"}; prices and product IDs unchanged.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Do not print provider request/response objects or credentials.
    const status = error?.statusCode || error?.status;
    console.error(error instanceof CatalogSyncError ? `Polar sync failed: ${error.message}` : `Polar API request failed${status ? ` (HTTP ${status})` : ""}; check server connectivity and token permissions, then rerun.`);
    process.exitCode = 1;
  });
}
