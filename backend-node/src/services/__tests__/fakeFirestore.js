// Minimal in-memory Firestore for ledger tests. Reproduces the properties the
// ledger relies on:
//   * transactions are serializable (run one at a time, reads see committed
//     state, writes apply atomically at commit, a throw discards them);
//   * set(..., {merge: true}) deep-merges plain objects;
//   * range queries only match values of the same type (null/missing never
//     match `<=` a Date — Firestore's type-bound ordering);
//   * outages can be injected: the next N operations throw.

function clone(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
}

function deepMerge(target, patch) {
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && out[k] && typeof out[k] === "object" && !(out[k] instanceof Date)) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = clone(v);
    }
  }
  return out;
}

export function createFakeFirestore() {
  const store = new Map(); // "col/id" -> data
  let chain = Promise.resolve();
  const faults = { remaining: 0, error: () => new Error("UNAVAILABLE: Firestore is unreachable (injected)") };

  function maybeFail() {
    if (faults.remaining > 0) {
      faults.remaining -= 1;
      throw faults.error();
    }
  }

  function snapshot(key) {
    const has = store.has(key);
    return { exists: has, id: key.split("/")[1], data: () => (has ? clone(store.get(key)) : undefined) };
  }

  function docRef(col, id) {
    const key = `${col}/${id}`;
    return {
      key,
      id,
      async get() {
        maybeFail();
        return snapshot(key);
      },
      async set(data, opts = {}) {
        maybeFail();
        store.set(key, opts.merge && store.has(key) ? deepMerge(store.get(key), data) : clone(data));
      },
    };
  }

  const db = {
    store,
    faults,
    failNext(n = 1) {
      faults.remaining = n;
    },
    collection(col) {
      const filters = [];
      let max = Infinity;
      const query = {
        doc: (id) => docRef(col, id),
        where(field, op, value) {
          filters.push({ field, op, value });
          return query;
        },
        limit(n) {
          max = n;
          return query;
        },
        async get() {
          maybeFail();
          const docs = [];
          for (const [key, data] of store) {
            if (!key.startsWith(`${col}/`)) continue;
            const ok = filters.every(({ field, op, value }) => {
              const v = data[field];
              if (!(v instanceof Date) || !(value instanceof Date)) return false;
              if (op === "<=") return v.getTime() <= value.getTime();
              if (op === "<") return v.getTime() < value.getTime();
              throw new Error(`fake: unsupported op ${op}`);
            });
            if (ok) docs.push({ ...snapshot(key), ref: docRef(col, key.split("/")[1]) });
            if (docs.length >= max) break;
          }
          return { docs, empty: docs.length === 0 };
        },
      };
      return query;
    },
    runTransaction(fn) {
      const run = chain.then(async () => {
        maybeFail();
        const writes = [];
        const tx = {
          async get(ref) {
            maybeFail();
            return snapshot(ref.key);
          },
          set(ref, data, opts = {}) {
            writes.push({ ref, data, opts });
          },
        };
        const result = await fn(tx);
        maybeFail(); // a commit can fail too
        for (const { ref, data, opts } of writes) {
          store.set(ref.key, opts.merge && store.has(ref.key) ? deepMerge(store.get(ref.key), data) : clone(data));
        }
        return result;
      });
      chain = run.catch(() => {});
      return run;
    },
  };
  return db;
}
