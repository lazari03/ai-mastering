// Generic version of chordHandoff.js's file-stashing half, for any free
// tool that needs to carry the user's uploaded audio across the real page
// navigation that happens after signing up (see PublicLufsMeter.jsx) —
// chordHandoff.js is left untouched since it also carries a JSON result
// (chords/key/BPM) that this generic version has no equivalent of; tools
// that only need "hand the same File to the Master tab" use this instead
// of a chord-specific module.
const DB_NAME = "toolHandoff";
const STORE_NAME = "files";
const FILE_KEY = "pending";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Best-effort, always — losing this just means the destination tab shows
// its normal empty upload state instead of the file already attached, the
// same fallback as chordHandoff.js's file half.
export async function stashPendingToolFile(file) {
  if (!file || typeof window === "undefined" || !window.indexedDB) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(file, FILE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.error("Failed to stash tool file for handoff (non-fatal):", error);
  }
}

export async function takePendingToolFile() {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  try {
    const db = await openDb();
    const file = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(FILE_KEY);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
      store.delete(FILE_KEY);
    });
    db.close();
    return file;
  } catch (error) {
    console.error("Failed to read back handed-off tool file (non-fatal):", error);
    return null;
  }
}
