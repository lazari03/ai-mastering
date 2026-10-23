// Lightweight heuristic password strength scorer — no zxcvbn dependency
// (that's ~800KB for something a handful of length/variety checks covers
// well enough for a signup-form indicator, not a security boundary).
const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"];
const COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];

export function scorePassword(password) {
  if (!password) return { score: 0, label: LABELS[0], color: COLORS[0], percent: 0 };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  // Common weak patterns knock a point off regardless of the checks above —
  // "Password123!" ticks every box but isn't actually strong.
  const lower = password.toLowerCase();
  const commonPatterns = ["password", "123456", "qwerty", "letmein", "admin", "welcome"];
  if (commonPatterns.some((p) => lower.includes(p))) score = Math.max(0, score - 2);

  const clamped = Math.max(0, Math.min(4, score));
  return {
    score: clamped,
    label: LABELS[clamped],
    color: COLORS[clamped],
    percent: ((clamped + 1) / 5) * 100,
  };
}
