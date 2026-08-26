// Rotating lines shown on the fullscreen mastering loader. Editorial
// mastering-engineer insight in the app's own voice — not attributed
// quotations from named people, deliberately, so nothing here risks
// putting words in a real person's mouth.
export const MASTERING_QUOTES = [
  "A good master serves the song, not the meter.",
  "Loudness is a choice. Clarity is the job.",
  "The best EQ move is often the one you don't make.",
  "Dynamics are the difference between a wall and a room.",
  "Every genre has a different idea of \"loud enough.\"",
  "A master should sound like the mix, only more itself.",
  "Bass you can't feel on a phone speaker isn't bass you can trust.",
  "The limiter's job is to catch peaks, not to define the sound.",
  "Mono compatibility isn't optional — it's how most of the world listens.",
  "Correction should be audible in the result, not in the process.",
  "True peak headroom exists so the encoder doesn't have to guess.",
  "A track that measures louder but loses its punch has lost the trade.",
  "The spectrum tells the truth before your ears catch up to it.",
  "Subtlety is not the absence of decision — it's the presence of restraint.",
  "Translation across speakers matters more than perfection on one.",
  "Every stage should earn its place, or be bypassed.",
];

/**
 * Deterministic-ish shuffle seeded by call time — not cryptographic, just
 * enough that the quote order doesn't feel identical across renders.
 */
export function shuffledQuotes() {
  const arr = [...MASTERING_QUOTES];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
