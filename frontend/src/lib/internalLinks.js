// Single source of truth for this site's internal link graph and CTA
// targets. Every page that links to another page or to a conversion
// target (signup, pricing) reads from here — nothing hardcodes "/login"
// or picks a "related content" link ad hoc in a content file. Change a
// relationship or a CTA destination once, here, and every page that uses
// it updates together.
import { GENRE_KEYS } from "@/content/genrePages";
import { POSTS } from "@/content/posts";

// ---- Conversion CTA targets ------------------------------------------
// One name per destination, used everywhere instead of a raw path string.
export const CTA = {
  // Frictionless entry point — no plan chosen yet, starts on Free.
  signup: "/login",
  // Anonymous visitors can't check out directly (Polar checkout requires
  // an authed uid — see BillingPanel.jsx), so "subscribe" from a public
  // page always means "go see the plans," not a direct checkout link.
  pricing: "/#pricing",
  blog: "/blog",
};

// ---- Genre <-> blog post graph ----------------------------------------
// One declared edge per genre, to the single most topically relevant
// post. Reverse lookups (which genres reference a given post) are
// derived, never duplicated by hand.
const GENRE_TO_POST = {
  pop: "what-happens-inside-an-ai-mastering-engine",
  edm: "what-happens-inside-an-ai-mastering-engine",
  lofi: "what-happens-inside-an-ai-mastering-engine",
  rock: "what-ai-mastering-actually-automates",
  acoustic: "what-ai-mastering-actually-automates",
  classical: "what-ai-mastering-actually-automates",
  hiphop: "building-a-repeatable-mastering-chain-for-your-studio",
  podcast: "building-a-repeatable-mastering-chain-for-your-studio",
};

const POST_BY_SLUG = Object.fromEntries(POSTS.map((p) => [p.slug, p]));

// Fails loud at build/import time if a genre/slug typo ever creeps in,
// rather than silently rendering a dead link in production.
for (const [genre, slug] of Object.entries(GENRE_TO_POST)) {
  if (!GENRE_KEYS.includes(genre)) throw new Error(`internalLinks: unknown genre "${genre}" in GENRE_TO_POST`);
  if (!POST_BY_SLUG[slug]) throw new Error(`internalLinks: unknown post slug "${slug}" for genre "${genre}"`);
}

export function relatedPostForGenre(genre) {
  const slug = GENRE_TO_POST[genre];
  return slug ? POST_BY_SLUG[slug] : null;
}

export function relatedGenresForPost(slug) {
  return Object.entries(GENRE_TO_POST)
    .filter(([, postSlug]) => postSlug === slug)
    .map(([genre]) => genre);
}

// ---- Chord Detector cross-links ----------------------------------------
// Chord detection is genre-agnostic (works on any recording, any
// instrument) so it's a legitimate "also useful" link from every genre
// page and every blog post — unlike GENRE_TO_POST, this isn't one
// declared edge per genre, it's one shared destination every content page
// reciprocally links to/from, matching how the feature is actually used.
export const CHORD_DETECTOR_URL = "/chord-detector";

// The reverse direction: which genre pages the chord-detector page itself
// links back out to. Kept short and specific (not "all 8") — these three
// are the genres where "know the chords" most obviously matters (bands
// covering songs, singer-songwriters, acoustic performers), which is a
// more honest, specific reciprocal link than a generic link-to-everything.
export const CHORD_DETECTOR_RELATED_GENRES = ["rock", "acoustic", "pop"];
