// Homepage FAQ, English. One source for both the visible FAQ (lib/i18n.js
// faq.q1..a8 "en") and the FAQPage structured data (app/page.js) — those
// were two hand-kept copies and had already drifted apart. Product facts are
// interpolated from lib/product.js / lib/pricing.js, never typed in.
import { PRODUCT, SUPPORTED_FORMATS_TEXT, PLANS, SINGLE_MASTER, STEM_SEPARATION } from "@/lib/product";

export const HOME_FAQ = [
  {
    q: "What file formats are supported?",
    a: `${SUPPORTED_FORMATS_TEXT} are accepted on upload (up to ${PRODUCT.maxUploadMb} MB) and decoded automatically before processing. Final export is WAV or MP3.`,
  },
  {
    q: "What's the difference between Standard and Professional?",
    a: `Both run the same analysis, the same correction logic, the same true-peak limiter and the same verification. Professional adds finer low-end control — separate sub and punch bands instead of one low band — and a transient-aware clipper the engine can use before the limiter to reach loudness with less limiting. Standard is what your ${PRODUCT.freeMasters} free masters and the ${PLANS.indie.label} plan use; Professional comes with ${PLANS.studio.label} and ${PLANS.pro.label}.`,
  },
  {
    q: "Can I keep an artist's sound consistent across releases?",
    a: "Yes — save an Artist Profile: the genre, style, objective and direction (warm, punchy, open…) that define their sound. Every new track is still analyzed and corrected on its own terms, then leaned toward that character, so releases sound related without copying one track's EQ onto another. Studios that need an exact processing chain can import one as JSON. Profiles are private to your account.",
  },
  {
    q: "Why does my mono source sound mono after mastering?",
    a: "If the uploaded file itself is mono (or near-mono), the output is mathematically mono too — mastering doesn't fabricate stereo information that was never there. The app detects and flags this so it's never a surprise.",
  },
  {
    q: "Is stem separation available?",
    a: `Yes — stem-aware mastering separates the vocal from the accompaniment so each can be rebalanced before the final master. ${PLANS.pro.label} includes ${PRODUCT.stems.includedPerMonth} a month; on any other plan you can buy a single stem-separated master for ${STEM_SEPARATION.price}.`,
  },
  {
    q: "Can I hear how it'll sound on Spotify or Instagram before downloading?",
    a: "Yes — Codec Preview runs a real MP3/AAC/Opus encode-decode round-trip on your mastered file and reports the true-peak, loudness, and high-frequency changes it caused.",
  },
  {
    q: "Is my music private?",
    a: `Your uploads and masters are only reachable from your own signed-in account, or through a share link you create and can revoke. Audio files are permanently deleted ${PRODUCT.retentionHours} hours after you create them, and Artist Profiles are private to your account.`,
  },
  {
    q: "What's actually free?",
    a: `30-second mastering previews (unlimited, Standard engine), chord/key/BPM detection and the LUFS meter (unlimited, always free), and ${PRODUCT.freeMasters} full-length masters total — a one-time trial, not renewed monthly. After that, single masters are ${SINGLE_MASTER.price} each, or subscribe: ${PLANS.indie.label} (${PLANS.indie.price}${PLANS.indie.period}), ${PLANS.studio.label} (${PLANS.studio.price}${PLANS.studio.period}) or ${PLANS.pro.label} (${PLANS.pro.price}${PLANS.pro.period}).`,
  },
];
