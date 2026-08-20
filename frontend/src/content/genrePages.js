// Content for the /master/[genre] landing pages. Mirrors backend-node's
// GENRES enum (config/constants.js) — duplicated here deliberately, not
// imported, since this is marketing copy tied to page routes
// (generateStaticParams), not runtime logic; the two only need to agree on
// the same 8 keys, and that enum changes rarely enough that a manual sync
// is fine (grep both files if it ever does).
//
// Each entry has genuinely distinct copy, not a find/replace template —
// duplicate/thin content across near-identical pages is a real SEO
// liability (Google can and does deindex templated doorway pages), so
// every "what the engine does" list below reflects real differences in
// how genre/style targets actually shift the DSP chain (see
// ai_mastering/mastering.py's genre target profiles).
export const GENRE_PAGES = {
  pop: {
    label: "Pop",
    headline: "AI Pop Mastering — Bright, Loud, and Radio-Ready",
    description:
      "Master pop tracks online with an adaptive DSP engine tuned for vocal presence, controlled low end, and competitive loudness — free Standard tier, no software install.",
    keywords: ["pop mastering", "AI pop mastering", "master pop song online", "vocal presence mastering"],
    intro:
      "Pop mixes live or die on vocal presence and a low end that stays controlled under club and earbud playback alike. The engine's pop target profile leans into upper-midrange clarity for vocals, keeps sub-bass energy tight rather than boomy, and pushes toward a loudness level that's competitive on streaming without crushing transients.",
    bullets: [
      "Presence-forward EQ targeting — vocals sit in front of the mix instead of getting buried by bus compression",
      "Tighter low-end control tuned for pop's typically dense arrangements (bass, kick, and sub layers stacked together)",
      "Streaming-competitive loudness targeting that still respects true-peak limits, so it won't distort on lossy playback",
      "Stem separation available on Studio+ if the vocal needs independent shaping from the rest of the mix",
    ],
  },
  hiphop: {
    label: "Hip-Hop",
    headline: "AI Hip-Hop Mastering — Punchy Low End, Clear Vocals",
    description:
      "Master hip-hop and rap tracks with a DSP chain that protects 808 weight and kick punch while keeping vocals cutting through — free Standard tier.",
    keywords: ["hip hop mastering", "rap mastering online", "808 mastering", "AI hip hop mastering"],
    intro:
      "Hip-hop mastering has to protect two things that fight each other: 808/sub weight and vocal clarity. The engine's hip-hop target profile allocates more headroom to the low end before compression kicks in, uses faster attack timing to preserve kick transients, and keeps the presence band open for vocals sitting over a dense low end.",
    bullets: [
      "Sub/808-aware bus compression — timing tuned to preserve punch instead of squashing the low end flat",
      "Presence-band clarity for vocals over dense, bass-heavy arrangements",
      "True-peak limiting that protects transient snap on kicks and 808 hits at high loudness targets",
      "Saved Artist presets let you lock in one producer's exact low-end signature across a whole project",
    ],
  },
  rock: {
    label: "Rock",
    headline: "AI Rock Mastering — Guitars, Drums, and Real Dynamics",
    description:
      "Master rock tracks with an engine that keeps guitar midrange present and drum transients intact, with dedicated 90s/2000s/modern rock style targets.",
    keywords: ["rock mastering", "AI rock mastering", "guitar mastering online", "drum transient mastering"],
    intro:
      "Rock is the one genre in this app with three distinct style targets — rock_90s, rock_2000s, and rock_modern — because the loudness/dynamics conventions genuinely changed across those eras. The engine's rock profiles all prioritize guitar midrange presence and drum transient preservation, but the loudness target and compression ratio shift meaningfully between a 90s-style dynamic master and a modern, denser one.",
    bullets: [
      "Three selectable rock styles (90s, 2000s, modern) — pick the era-appropriate loudness/dynamics target instead of one generic \"rock\" preset",
      "Midrange EQ targeting tuned for guitar presence without harshness building up under distortion",
      "Compression timing that preserves drum transients rather than flattening the kit",
      "Professional mode gives full manual control over the bus compressor if you want to override the style default",
    ],
  },
  edm: {
    label: "EDM",
    headline: "AI EDM Mastering — Wide, Loud, Club-Ready",
    description:
      "Master EDM and electronic tracks with true-peak-safe limiting built for club and streaming loudness, plus stereo width control for wide, modern electronic mixes.",
    keywords: ["EDM mastering", "electronic music mastering", "AI EDM mastering", "club mastering loudness"],
    intro:
      "EDM masters typically push the loudest, most stereo-wide targets of any genre in the engine, and that combination is exactly where a naive limiter falls apart — inter-sample peaks that a sample-peak limiter misses become audible distortion at these loudness levels. The engine's true-peak-aware limiting exists specifically for this case.",
    bullets: [
      "High loudness targeting with true-peak-aware limiting — avoids the inter-sample clipping a simpler limiter would introduce at EDM-typical loudness",
      "Stereo width processing tuned for wide, modern electronic mixes without collapsing mono compatibility",
      "electronic_modern style target available for a more contemporary EDM loudness/tonal profile",
      "Reference mode lets you match another EDM track's tone directly if you have a specific reference in mind",
    ],
  },
  acoustic: {
    label: "Acoustic",
    headline: "AI Acoustic Mastering — Natural Dynamics, Honest Tone",
    description:
      "Master acoustic and singer-songwriter tracks with a gentler DSP chain that preserves natural dynamics instead of flattening them for loudness.",
    keywords: ["acoustic mastering", "singer songwriter mastering", "AI acoustic mastering", "natural dynamics mastering"],
    intro:
      "Acoustic material is usually the wrong candidate for aggressive loudness targeting — the dynamics are part of the performance. The engine's acoustic profile uses lighter bus compression and a lower loudness target than genres like EDM or hip-hop, prioritizing tonal accuracy and natural dynamic range over sheer loudness.",
    bullets: [
      "Lighter compression ratios that preserve performance dynamics instead of flattening them",
      "Lower, more conservative loudness targeting appropriate for acoustic listening contexts",
      "Tonal EQ aimed at natural instrument timbre rather than aggressive brightness boosting",
      "Professional mode available if a specific track still needs more control than the adaptive default",
    ],
  },
  lofi: {
    label: "Lo-Fi",
    headline: "AI Lo-Fi Mastering — Warm, Textured, Intentionally Soft",
    description:
      "Master lo-fi tracks with a DSP chain that leans into warmth and texture instead of fighting it — tuned for lo-fi's intentionally softer, warmer tonal target.",
    keywords: ["lofi mastering", "lo-fi mastering online", "AI lofi mastering", "warm mastering"],
    intro:
      "Lo-fi is a genre where \"technically cleaner\" often means \"worse\" — the warmth, softened transients, and gentle top-end roll-off are the point. The engine's lo-fi profile is tuned around that: less aggressive high-frequency emphasis, warmer tonal balance, and a loudness target that doesn't fight the genre's intentionally relaxed dynamics.",
    bullets: [
      "Warmer tonal EQ target instead of the bright, presence-forward curve used for pop/EDM",
      "Softer loudness target that respects lo-fi's relaxed dynamic character",
      "Saturation available (Professional mode) to add harmonic warmth deliberately, not as an afterthought",
      "Works well with Reference mode if you have a specific lo-fi track whose tone you're matching",
    ],
  },
  podcast: {
    label: "Podcast",
    headline: "AI Podcast Mastering — Clear, Consistent Voice, Every Episode",
    description:
      "Master podcast and voice content with loudness normalization tuned for spoken word, plus optional noise-aware processing for consistent episode-to-episode volume.",
    keywords: ["podcast mastering", "podcast loudness normalization", "AI voice mastering", "spoken word audio mastering"],
    intro:
      "Podcast mastering isn't music mastering with the same knobs turned down — spoken word has a different dynamic range, different loudness standards (podcast platforms typically target around -16 to -19 LUFS, quieter than music streaming), and intelligibility matters more than tonal excitement. The engine's podcast profile targets that spoken-word loudness range specifically.",
    bullets: [
      "Loudness targeting tuned for spoken-word platform standards, not music-streaming loudness wars",
      "EQ aimed at vocal intelligibility and consistency rather than musical brightness",
      "Saved Artist presets are useful here for a show's specific host voice/room, applied identically every episode",
      "Free tier covers most single-host podcast mastering needs without a subscription",
    ],
  },
  classical: {
    label: "Classical",
    headline: "AI Classical Mastering — Full Dynamic Range, Preserved",
    description:
      "Master classical and orchestral recordings with minimal, transparent processing that respects the recording's natural dynamic range instead of compressing it away.",
    keywords: ["classical mastering", "orchestral mastering", "AI classical mastering", "dynamic range preservation"],
    intro:
      "Classical is the genre where the mastering engine does the least, on purpose. A well-recorded orchestral or chamber piece already has the dynamic range and tonal balance the genre calls for — the engine's classical profile uses minimal compression and a conservative loudness target, prioritizing transparency over the loudness-focused processing used elsewhere.",
    bullets: [
      "Minimal, transparent bus compression that preserves recorded dynamic range instead of competing for loudness",
      "Conservative loudness targeting appropriate for classical listening contexts, not streaming loudness-war levels",
      "True-peak-safe limiting still applied as a safety ceiling, without shaping the sound",
      "Professional mode available for engineers who want manual control over every stage regardless",
    ],
  },
};

export const GENRE_KEYS = Object.keys(GENRE_PAGES);
