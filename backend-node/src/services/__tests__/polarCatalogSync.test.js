import { test } from "node:test";
import assert from "node:assert/strict";
import { syncPolarCatalog } from "../../../scripts/sync-polar-products.js";
import { POLAR_CATALOG } from "../../../scripts/polar-catalog.js";

function setup() {
  const env = Object.fromEntries(POLAR_CATALOG.map((e, i) => [e.envVar, `product-${i}`]));
  const items = POLAR_CATALOG.map((e, i) => ({
    id: `product-${i}`, name: e.name, description: "Old copy", isArchived: false,
    recurringInterval: e.interval, recurringIntervalCount: 1,
    metadata: { auralith_key: e.key },
    prices: [{ id: `price-${i}`, amountType: "fixed", priceAmount: e.amount, priceCurrency: "eur" }],
  }));
  const writes = [];
  const polar = { products: {
    list: async () => (async function* () {
      yield { result: { items: items.slice(0, 4) } };
      yield { result: { items: items.slice(4) } };
    })(),
    update: async (input) => {
      writes.push(input);
      Object.assign(items.find((p) => p.id === input.id), input.productUpdate);
    },
  }};
  return { env, items, writes, polar };
}

test("dry run reads all pages and writes nothing", async () => {
  const x = setup();
  assert.deepEqual(await syncPolarCatalog(x), { verified: 8, changed: 8, applied: false });
  assert.equal(x.writes.length, 0);
});

test("updates all copy, never sends pricing or subscription fields, verifies and reruns without writes", async () => {
  const x = setup();
  const prices = structuredClone(x.items.map((p) => p.prices));
  assert.deepEqual(await syncPolarCatalog({ ...x, apply: true }), { verified: 8, changed: 8, applied: true });
  for (const w of x.writes) assert.deepEqual(Object.keys(w.productUpdate).sort(), ["description", "name"]);
  assert.deepEqual(x.items.map((p) => p.prices), prices);
  assert.equal((await syncPolarCatalog({ ...x, apply: true })).changed, 0);
  assert.equal(x.writes.length, 8);
});

test("invalid final product blocks every write", async () => {
  for (const mutate of [
    (x) => { x.items[7].prices[0].priceAmount = 1; },
    (x) => { x.items[7].recurringInterval = "year"; },
    (x) => { x.items[7].isArchived = true; },
    (x) => { x.items[7].metadata.auralith_key = "wrong"; },
    (x) => { delete x.env[POLAR_CATALOG[7].envVar]; },
    (x) => { x.env[POLAR_CATALOG[7].envVar] = x.env[POLAR_CATALOG[0].envVar]; },
  ]) {
    const x = setup(); mutate(x);
    await assert.rejects(syncPolarCatalog({ ...x, apply: true }));
    assert.equal(x.writes.length, 0);
  }
});

test("a partial update can be resumed safely without recreating or repricing", async () => {
  const x = setup();
  const update = x.polar.products.update;
  let calls = 0;
  x.polar.products.update = async (input) => {
    if (++calls === 3) throw new Error("temporary provider outage");
    await update(input);
  };
  await assert.rejects(syncPolarCatalog({ ...x, apply: true }));
  x.polar.products.update = update;
  assert.equal((await syncPolarCatalog({ ...x, apply: true })).changed, 6);
  assert.equal(x.writes.length, 8);
});

test("verification rejects a provider that did not persist the change", async () => {
  const x = setup();
  x.polar.products.update = async () => {};
  await assert.rejects(syncPolarCatalog({ ...x, apply: true }), /verification failed/);
});

test("Polar catalog prices and intervals match the public pricing configuration", async () => {
  const { PLANS, SINGLE_MASTER, STEM_SEPARATION } = await import("../../../../frontend/src/lib/pricing.js");
  const amount = (s) => Math.round(Number(s.replace("€", "")) * 100);
  const expected = [
    ...["indie", "studio", "pro"].flatMap((key) => [
      { amount: amount(PLANS[key].price), interval: "month" },
      { amount: amount(PLANS[key].annual.price), interval: "year" },
    ]),
    { amount: amount(SINGLE_MASTER.price), interval: null },
    { amount: amount(STEM_SEPARATION.price), interval: null },
  ];
  assert.deepEqual(POLAR_CATALOG.map(({ amount, interval }) => ({ amount, interval })), expected);
});
