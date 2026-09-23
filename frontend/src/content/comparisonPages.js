// Content for the /vs/[competitor] pages — targets "Auralith vs X" and
// "X alternative" searches (people already evaluating a specific tool,
// not yet aware Auralith exists).
//
// Deliberate constraint: nothing here states a competitor's current price
// or claims a feature they lack. Competitor pricing/features change and
// this repo has no live way to verify either — publishing a specific
// number here that later goes stale (or was wrong to begin with) is a
// real reputational/legal liability for a public comparison page. What's
// safe to state and stays true regardless of their current pricing page:
// their well-known, stable market positioning (LANDR as an all-in-one
// mastering+distribution platform; eMastered as a mastering-focused
// subscription tool) and everything about Auralith itself, which is
// built from lib/product.js / lib/pricing.js below, not hand-typed. Every entry links out
// to the competitor's own pricing page so a reader can check current
// numbers themselves rather than trusting a number frozen in this file.
import { PRODUCT, planLadderText, paidEntryText } from "@/lib/product";

const PRICING_SHAPE = `${planLadderText()}. Chord, key and BPM detection are free for everyone, on every plan.`;
const ADAPTIVE =
  "Measures your mix first (loudness, spectrum, dynamics, transients, stereo), fixes only what it finds, and leaves healthy regions alone. Genre and style set the destination — what to protect and where the loudness and tonal targets sit — not a fixed preset chain.";

export const COMPARISON_PAGES = {
  landr: {
    label: "LANDR",
    externalUrl: "https://www.landr.com",
    headline: "Auralith Forge vs LANDR",
    description:
      "How Auralith Forge's adaptive DSP mastering compares to LANDR — analysis-first processing with genre as context, transparent per-master pricing, and what each is actually built for.",
    keywords: ["auralith forge vs landr", "landr alternative", "landr alternative for mastering", "ai mastering comparison"],
    intro:
      "LANDR built its name as an all-in-one platform — AI mastering bundled with music distribution, sample packs, and plugins. That's a genuinely different product shape than Auralith Forge, which does one thing: mastering, with a DSP chain you can actually reason about (it measures your mix first, corrects only what needs it, and shows what it changed — not one opaque \"AI master\" button) and pricing that's just about the masters, nothing else bundled in.",
    positioningPoints: [
      {
        title: "What it's built for",
        auralith: "Mastering only — one adaptive DSP engine that reads each track before deciding anything, nothing else bundled in.",
        competitor: "Mastering bundled with distribution, sample packs, and plugin tools — useful if you want the wider suite, extra cost/complexity if you don't.",
      },
      {
        title: "How it processes your track",
        auralith: ADAPTIVE + " The per-genre targets are documented on the mastering pages below.",
        competitor: "AI mastering engine — check their site for how much control/customization the current version exposes.",
      },
      {
        title: "Codec preview",
        auralith: "Built in — hear how your master actually sounds after a real MP3/AAC/Opus encode-decode round trip (what Spotify/Instagram do to it), with the true-peak/loudness delta reported.",
        competitor: "Check their current feature set — this isn't something every AI mastering tool offers.",
      },
      {
        title: "Pricing shape",
        auralith: PRICING_SHAPE,
        competitor: "Check landr.com/pricing for current plans — pricing and what's included has changed over time.",
      },
    ],
    faq: [
      {
        question: "Is Auralith Forge cheaper than LANDR?",
        answer:
          `Depends what you're comparing — Auralith Forge is mastering-only, so it's priced for that alone (a free trial, then ${paidEntryText()}). LANDR bundles mastering with distribution and other tools, so a direct dollar-for-dollar comparison isn't apples-to-apples; check landr.com/pricing for their current numbers against what you'd actually use.`,
      },
      {
        question: "Can I try Auralith Forge before switching?",
        answer: "Yes — 3 full-length masters free, no card required, so you can compare the actual output on your own track before deciding anything.",
      },
    ],
  },
  emastered: {
    label: "eMastered",
    externalUrl: "https://emastered.com",
    headline: "Auralith Forge vs eMastered",
    description:
      "How Auralith Forge's adaptive DSP mastering compares to eMastered — analysis-first processing with genre as context, vocal/accompaniment stem mastering, and transparent pricing.",
    keywords: ["auralith forge vs emastered", "emastered alternative", "emastered alternative for mastering", "ai mastering comparison"],
    intro:
      "eMastered, like Auralith Forge, is a mastering-focused tool rather than a bundled distribution platform — the closer comparison of the two. Where Auralith Forge differentiates is analysis-first processing (it measures your mix and changes only what needs it, with genre as context rather than a one-size-fits-all master), stem-aware processing that rebalances vocals against the accompaniment, and a codec preview that shows exactly what streaming/social compression does to the finished file before you download it.",
    positioningPoints: [
      {
        title: "Genre-aware, but your mix decides",
        auralith: ADAPTIVE + " See the mastering pages below for how each genre (pop, hip-hop, EDM, rock and more) shifts the targets.",
        competitor: "Check their current feature set for how genre-aware their processing is.",
      },
      {
        title: "Stem-aware mastering",
        auralith: `Separates the vocal from the accompaniment so each can be rebalanced before the final master. Included on All-Access (${PRODUCT.stems.includedPerMonth}/month); a single stem-separated master can be bought on any plan.`,
        competitor: "Check emastered.com for whether stem separation is offered on their current plans.",
      },
      {
        title: "Codec preview",
        auralith: "Built in — a real MP3/AAC/Opus encode-decode round trip on your mastered file, reporting true-peak/loudness/high-frequency changes before you commit to a download.",
        competitor: "Check their current feature set — not every AI mastering tool offers this.",
      },
      {
        title: "Pricing shape",
        auralith: PRICING_SHAPE,
        competitor: "Check emastered.com/pricing for their current plans.",
      },
    ],
    faq: [
      {
        question: "Is Auralith Forge better than eMastered?",
        answer:
          "\"Better\" depends on your ears and your track — that's exactly why the free trial exists. What's objectively different: analysis-first processing that preserves what already works, vocal/accompaniment stem mastering, and built-in codec preview. Try 3 masters free and compare the actual output on your own song.",
      },
      {
        question: "Does Auralith Forge offer a free trial like eMastered?",
        answer: "Yes — 3 full-length masters free, lifetime (not a time-limited trial), no card required.",
      },
    ],
  },
};

export const COMPARISON_KEYS = Object.keys(COMPARISON_PAGES);
