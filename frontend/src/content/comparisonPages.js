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
// pulled from lib/pricing.js, not hand-typed here. Every entry links out
// to the competitor's own pricing page so a reader can check current
// numbers themselves rather than trusting a number frozen in this file.
export const COMPARISON_PAGES = {
  landr: {
    label: "LANDR",
    externalUrl: "https://www.landr.com",
    headline: "Auralith Forge vs LANDR",
    description:
      "How Auralith Forge's adaptive DSP mastering compares to LANDR — genre-specific processing, transparent per-master pricing, and what each is actually built for.",
    keywords: ["auralith forge vs landr", "landr alternative", "landr alternative for mastering", "ai mastering comparison"],
    intro:
      "LANDR built its name as an all-in-one platform — AI mastering bundled with music distribution, sample packs, and plugins. That's a genuinely different product shape than Auralith Forge, which does one thing: mastering, with a DSP chain you can actually reason about (real EQ/compression/limiting stages tuned per genre, not one opaque \"AI master\" button) and pricing that's just about the masters, nothing else bundled in.",
    positioningPoints: [
      {
        title: "What it's built for",
        auralith: "Mastering only — one DSP engine, tuned per genre, nothing else bundled in.",
        competitor: "Mastering bundled with distribution, sample packs, and plugin tools — useful if you want the wider suite, extra cost/complexity if you don't.",
      },
      {
        title: "How it processes your track",
        auralith: "Genre-aware target profiles (EQ, multiband compression, saturation, true-peak limiting) you can see documented per genre — see the mastering pages below.",
        competitor: "AI mastering engine — check their site for how much control/customization the current version exposes.",
      },
      {
        title: "Codec preview",
        auralith: "Built in — hear how your master actually sounds after a real MP3/AAC/Opus encode-decode round trip (what Spotify/Instagram do to it), with the true-peak/loudness delta reported.",
        competitor: "Check their current feature set — this isn't something every AI mastering tool offers.",
      },
      {
        title: "Pricing shape",
        auralith: "Free (3 masters, lifetime trial, no card) → Studio €9.99/mo (50 masters) → All-Access €19.99/mo (250 masters, stems, unlimited chords).",
        competitor: "Check landr.com/pricing for current plans — pricing and what's included has changed over time.",
      },
    ],
    faq: [
      {
        question: "Is Auralith Forge cheaper than LANDR?",
        answer:
          "Depends what you're comparing — Auralith Forge is mastering-only, so it's priced for that alone (Free trial, then €9.99/mo for 50 masters). LANDR bundles mastering with distribution and other tools, so a direct dollar-for-dollar comparison isn't apples-to-apples; check landr.com/pricing for their current numbers against what you'd actually use.",
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
      "How Auralith Forge's adaptive DSP mastering compares to eMastered — genre-specific processing, stem-aware mastering, and transparent pricing.",
    keywords: ["auralith forge vs emastered", "emastered alternative", "emastered alternative for mastering", "ai mastering comparison"],
    intro:
      "eMastered, like Auralith Forge, is a mastering-focused tool rather than a bundled distribution platform — the closer comparison of the two. Where Auralith Forge differentiates is genre-specific DSP target profiles (documented per genre, not a single one-size-fits-all master), stem-aware processing for independent control over vocals/drums/bass, and a codec preview that shows exactly what streaming/social compression does to the finished file before you download it.",
    positioningPoints: [
      {
        title: "Genre-specific processing",
        auralith: "Distinct target profiles per genre (pop, hip-hop, EDM, rock, and more) — see the mastering pages below for what actually changes per genre.",
        competitor: "Check their current feature set for how genre-aware their processing is.",
      },
      {
        title: "Stem-aware mastering",
        auralith: "Included on Studio+ — masters vocals, drums, bass, and other elements with independent, more targeted control instead of one full-mix chain.",
        competitor: "Check emastered.com for whether stem separation is offered on their current plans.",
      },
      {
        title: "Codec preview",
        auralith: "Built in — a real MP3/AAC/Opus encode-decode round trip on your mastered file, reporting true-peak/loudness/high-frequency changes before you commit to a download.",
        competitor: "Check their current feature set — not every AI mastering tool offers this.",
      },
      {
        title: "Pricing shape",
        auralith: "Free (3 masters, lifetime trial, no card) → Studio €9.99/mo (50 masters) → All-Access €19.99/mo (250 masters, stems, unlimited chords).",
        competitor: "Check emastered.com/pricing for their current plans.",
      },
    ],
    faq: [
      {
        question: "Is Auralith Forge better than eMastered?",
        answer:
          "\"Better\" depends on your ears and your track — that's exactly why the free trial exists. What's objectively different: genre-specific target profiles, stem-aware mastering on Studio+, and built-in codec preview. Try 3 masters free and compare the actual output on your own song.",
      },
      {
        question: "Does Auralith Forge offer a free trial like eMastered?",
        answer: "Yes — 3 full-length masters free, lifetime (not a time-limited trial), no card required.",
      },
    ],
  },
};

export const COMPARISON_KEYS = Object.keys(COMPARISON_PAGES);
