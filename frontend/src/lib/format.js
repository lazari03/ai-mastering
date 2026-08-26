// Small shared display-formatting helpers — kept separate from any one
// component so every place that shows a user-supplied filename (results
// page, My Masters list, anywhere else in the future) shortens it the same
// way instead of each hand-rolling its own truncation.

// Shortens a filename for display by collapsing the middle of the base
// name while always preserving the extension — "a-really-long-track-name-
// exported-from-my-daw-final-v3.wav" becomes "a-really-long-track…final-
// v3.wav" rather than being cut off mid-word with no indication of what
// was lost. CSS `truncate` alone (used elsewhere for things like email
// addresses) just clips from one side with no visibility into the tail;
// a filename's extension and trailing "-v3"/"-master" suffix are often the
// part that actually distinguishes it from a dozen similarly-named
// exports, so this keeps both ends and drops only the middle.
export function shortenFilename(name, maxLength = 42) {
  if (!name) return "";
  if (name.length <= maxLength) return name;

  const dotIndex = name.lastIndexOf(".");
  // Only treat it as a "real" extension if it's short and not the whole name
  // (e.g. ".wav", ".mp3" — not a dotfile or a name with no extension at all).
  const hasExt = dotIndex > 0 && name.length - dotIndex <= 6;
  const ext = hasExt ? name.slice(dotIndex) : "";
  const base = hasExt ? name.slice(0, dotIndex) : name;

  const budget = maxLength - ext.length - 1; // -1 for the ellipsis char
  if (budget <= 6) {
    // Degenerate case (a very long extension or tiny maxLength) — fall
    // back to a plain head-truncation of the whole string.
    return `${name.slice(0, Math.max(1, maxLength - 1))}…`;
  }

  const headLen = Math.ceil(budget * 0.6);
  const tailLen = budget - headLen;
  const head = base.slice(0, headLen);
  const tail = tailLen > 0 ? base.slice(base.length - tailLen) : "";
  return `${head}…${tail}${ext}`;
}
