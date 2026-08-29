// Hand-off between the public, logged-out chord detector
// (PublicChordDetector.jsx) and the in-app Chords tab (ChordsPanel.jsx) —
// chord analysis has never been a persisted server-side "job" the way
// mastering is (the result IS the response body, never written to
// Firestore), so carrying a result across the real page navigation that
// happens after signing up/logging in means stashing it client-side.
// sessionStorage, not localStorage: this is a one-shot handoff for the
// tab that's mid-flow, not something that should silently reappear in an
// unrelated later visit.
const KEY = "pendingChordResult";

export function stashPendingChordResult(result, fileName) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ result, fileName, at: Date.now() }));
  } catch {
    // Unavailable (private mode, quota) — the redirect still happens,
    // ChordsPanel just finds nothing to pick up and shows its normal
    // empty upload state instead of the carried-over result.
  }
}

// Consume-once: read and immediately clear, so refreshing the Chords tab
// afterward shows the normal empty state rather than replaying a stale
// result forever.
export function takePendingChordResult() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
