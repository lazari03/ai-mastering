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

// seoTitle is the <title>/og:title, written lead-with-the-query: people
// search "<competitor> alternative", not "Auralith Forge vs <competitor>"
// (they don't know the brand yet). It already names the brand, so the
// page template doesn't append "| Auralith Forge" again. headline stays the
// on-page H1.
export const COMPARISON_PAGES = {
  landr: {
    label: "LANDR",
    externalUrl: "https://www.landr.com",
    headline: "Auralith Forge vs LANDR",
    seoTitle: "LANDR Alternative for Online Mastering — Auralith Forge vs LANDR",
    description:
      "Looking for a LANDR alternative? Compare Auralith Forge's analysis-first DSP mastering with LANDR: how each processes, codec preview, pricing. 3 masters free.",
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
    seoTitle: "eMastered Alternative — Auralith Forge vs eMastered Compared",
    description:
      "Looking for an eMastered alternative? Compare Auralith Forge's analysis-first DSP mastering with eMastered: stem-aware mastering, codec preview, pricing. 3 masters free.",
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
  // "bandlab mastering" (+50%) and "bandlab" (+40%) were the fastest-rising
  // queries in the Oct 2026 Google Trends pull for online mastering. Same
  // rules as above: positioning only (BandLab's free DAW + community, stable
  // for years), no claims about its current mastering features.
  bandlab: {
    label: "BandLab",
    externalUrl: "https://www.bandlab.com",
    headline: "BandLab Mastering vs Auralith Forge",
    seoTitle: "BandLab Mastering Alternative — BandLab vs Auralith Forge",
    description:
      "BandLab mastering vs Auralith Forge — a free one-click master inside a DAW, or an adaptive DSP engine that measures your mix first. When each makes sense, and how to compare them on your own track.",
    keywords: ["bandlab mastering", "bandlab mastering alternative", "auralith forge vs bandlab", "bandlab alternative", "free online mastering"],
    intro:
      "BandLab is a free, browser-based DAW and music community, and its mastering lives inside that ecosystem — convenient if you already make your tracks there. Auralith Forge is a dedicated mastering tool: it measures loudness, spectrum, dynamics, transients and stereo first, changes only what needs it, and shows you what it changed. If BandLab's master is close but not quite there, the honest test is to run the same mix through both and compare at matched loudness.",
    positioningPoints: [
      {
        title: "What it's built for",
        auralith: "Mastering only — one adaptive DSP engine that reads each track before deciding anything, with codec preview and loudness-matched A/B built in.",
        competitor: "An all-in-one free music platform — DAW, collaboration and community — with mastering as one feature among many.",
      },
      {
        title: "How it processes your track",
        auralith: ADAPTIVE,
        competitor: "Check bandlab.com for how much control the current mastering feature exposes and how it decides its processing.",
      },
      {
        title: "Delivery checks",
        auralith: "True-peak ceiling enforced, mono-compatibility and clipping checked on the rendered file, and a real MP3/AAC/Opus round-trip so you hear what streaming does to it.",
        competitor: "Check their current feature set for loudness and true-peak reporting.",
      },
      {
        title: "Pricing shape",
        auralith: PRICING_SHAPE,
        competitor: "BandLab's core platform is free — check bandlab.com for what its current mastering offer includes.",
      },
    ],
    faq: [
      {
        question: "Is BandLab mastering good enough, or do I need something else?",
        answer:
          "If you like what it gives you, keep using it. Where a dedicated engine helps is control and verification: Auralith Forge measures your mix before deciding, keeps healthy regions untouched, enforces a true-peak ceiling for streaming, and lets you compare against your mix at matched loudness — so a louder master can't win the comparison just by being louder.",
      },
      {
        question: "Can I master a song made in BandLab with Auralith Forge?",
        answer: "Yes — export your mix as WAV (or another supported format) from BandLab and upload it. You get 3 full-length masters free, no card required, so you can compare both masters on the same song.",
      },
    ],
  },
  waves: {
    label: "Waves Online Mastering",
    externalUrl: "https://www.waves.com",
    headline: "Waves Online Mastering vs Auralith Forge",
    seoTitle: "Waves Online Mastering Alternative — Waves vs Auralith Forge",
    description:
      "Waves Online Mastering vs Auralith Forge — two browser-based mastering services compared on how they process your mix, what you can verify before downloading, and pricing shape.",
    keywords: ["waves online mastering", "waves mastering online", "waves online mastering alternative", "auralith forge vs waves"],
    intro:
      "Waves is best known for its audio plugins, and its online mastering service brings that name to a browser upload. Auralith Forge is built only for mastering: an adaptive DSP engine that measures your mix first, sizes every move to what it finds, and reports what it changed — with codec preview and loudness-matched A/B so you can verify the result before you download it.",
    positioningPoints: [
      {
        title: "How it processes your track",
        auralith: ADAPTIVE,
        competitor: "Check waves.com for how their online mastering decides its processing and what you can adjust.",
      },
      {
        title: "Verifying the result",
        auralith: "Loudness-matched before/after, true-peak and loudness reporting, and a real MP3/AAC/Opus encode-decode preview of the mastered file.",
        competitor: "Check their current feature set for what's reported and previewed before download.",
      },
      {
        title: "Pricing shape",
        auralith: PRICING_SHAPE,
        competitor: "Check waves.com for current online mastering pricing.",
      },
    ],
    faq: [
      {
        question: "Is Auralith Forge a Waves Online Mastering alternative?",
        answer:
          "Yes — both master an uploaded mix in the browser. The way to choose is to master the same song in both and compare at matched loudness. Auralith Forge's 3 free masters (no card) make that comparison free on this side.",
      },
    ],
  },
};

export const COMPARISON_KEYS = Object.keys(COMPARISON_PAGES);
