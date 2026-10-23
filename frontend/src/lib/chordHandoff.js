// Hand-off between the public, logged-out chord detector
// (PublicChordDetector.jsx) and the in-app Chords tab (ChordsPanel.jsx) —
// chord analysis has never been a persisted server-side "job" the way
// mastering is (the result IS the response body, never written to
// Firestore), so carrying both the parsed result AND the original audio
// file across the real page navigation that happens after signing
// up/logging in means stashing them client-side, nowhere near the
// backend. Two different storage layers because they're different kinds
// of data:
//  - The JSON result → sessionStorage. Small, text, needs nothing fancier.
//  - The audio File → IndexedDB. sessionStorage can't hold binary data;
//    IndexedDB can hold a real File (name/type preserved via structured
//    clone) and is same-origin, same-browser, which is exactly the
//    lifetime this handoff needs — no server upload, no extra Firestore
//    doc, nothing that outlives the one redirect it's for.
// Both are consume-once: read and immediately cleared, so a later reload
// of the Chords tab shows its normal empty state, not a replayed result.
const RESULT_KEY = "pendingChordResult";
const DB_NAME = "chordHandoff";
const STORE_NAME = "files";
const FILE_KEY = "pending";

export function stashPendingChordResult(result, fileName) {
  try {
    window.sessionStorage.setItem(RESULT_KEY, JSON.stringify({ result, fileName, at: Date.now() }));
  } catch {
    // Unavailable (private mode, quota) — the redirect still happens,
    // ChordsPanel just finds nothing to pick up and shows its normal
    // empty upload state instead of the carried-over result.
  }
}

export function takePendingChordResult() {
  try {
    const raw = window.sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(RESULT_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Best-effort, always — a visualizer/playback nicety, never something
// the actual "see your chords" flow depends on. Any failure here (no
// IndexedDB support, quota, a private-mode restriction) just means the
// destination falls back to no file/no playback, same as before this
// existed.
export async function stashPendingChordFile(file) {
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
    console.error("Failed to stash chord file for handoff (non-fatal):", error);
  }
}

export async function takePendingChordFile() {
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
    console.error("Failed to read back handed-off chord file (non-fatal):", error);
    return null;
  }
}
