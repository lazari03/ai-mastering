import { SITE_URL } from "@/lib/seo";

// Served automatically at /robots.txt by the Next.js App Router convention.
//
// Why this file names crawlers explicitly instead of relying on one "*"
// group: robots.txt group matching is "most specific wins, and only that
// group applies". A crawler that finds a group naming itself ignores the
// "*" group entirely. That cuts both ways —
//   - it's why an explicit group is the only way to be *sure* a given bot
//     is allowed (a future edit tightening "*" can't silently catch it), and
//   - it's why every group below must repeat the same DISALLOW list; a
//     group with `allow: "/"` and no disallow would hand that one bot the
//     authenticated dashboard and users' private share links.
// Hence PUBLIC_RULES() rather than hand-written per-bot objects.

// The only paths with no public content. These match exactly the three
// routes that already set `noindex: true` in their metadata (app/page.js,
// thank-you/page.js, shared/[jobId]/page.js) — kept in sync deliberately.
//
// Disallow rather than relying on the noindex alone, because for these
// three "don't fetch it at all" is the actual goal, not just "don't list
// it": /app is an authenticated dashboard, /shared/<jobId> are private
// download links a user hands to a specific collaborator, and /thank-you
// is a post-checkout page. None is currently indexed or externally linked,
// so the usual disallow-hides-the-noindex trap doesn't apply here — that
// only bites when a URL is already in the index and needs the noindex read
// to get *out*. If one of these ever does show up in search results,
// remove it from this list temporarily so the noindex can be crawled.
const DISALLOW = ["/app", "/thank-you", "/shared/"];

// Explicitly named so a future tightening of the "*" group can't silently
// take AI answer engines with it. Being cited by ChatGPT/Perplexity/Claude
// search is the point of llms.txt (public/llms.txt) — blocking the
// crawlers that read it would make that file dead weight.
//
//   GPTBot        — OpenAI's crawler (model training + retrieval corpus)
//   ChatGPT-User  — fetches a page live when a ChatGPT user's prompt needs it
//   OAI-SearchBot — indexes for ChatGPT Search specifically
//   PerplexityBot / Perplexity-User — same split for Perplexity
//   ClaudeBot / Claude-User / Claude-SearchBot — same split for Claude
//   Google-Extended / Applebot-Extended — not crawlers at all: opt-in
//     tokens controlling whether already-crawled content may be used for
//     Gemini / Apple Intelligence grounding. Listing them as allowed is
//     what keeps that opt-in on.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "Google-Extended",
  "Applebot-Extended",
];

// One rule group: crawl everything public, nothing private.
const publicRule = (userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW });

export default function robots() {
  return {
    rules: [
      // Traditional search first — named explicitly for the same reason as
      // above, so "is Googlebot definitely allowed?" is answerable by
      // reading this file rather than by reasoning about the "*" fallback.
      publicRule("Googlebot"),
      publicRule("Bingbot"),
      publicRule(AI_CRAWLERS),
      // Fallback for everything not named above.
      publicRule("*"),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
