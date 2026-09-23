import AnalyzeToolPage from "@/components/site/AnalyzeToolPage";
import { CTA, CHORD_DETECTOR_RELATED_GENRES } from "@/lib/internalLinks";
import { GENRE_PAGES } from "@/content/genrePages";
import { TOOL_LANDING_KEYS } from "@/content/toolLandingPages";
import { buildMetadata, absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Chord Detector — Find Key, BPM & Chords Online | ${SITE_NAME}`,
  description:
    "Upload a song and get its key, BPM, and full chord progression back — for guitar, piano, or any instrument. Completely free, no limit, no card required.",
  path: "/chord-detector",
  keywords: [
    "chord detector",
    "chord detection online",
    "find chords in a song",
    "guitar chord finder",
    "AI chord recognition",
    "song key finder",
    "BPM detector",
  ],
});

const SERVICE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Chord Detector",
  serviceType: "Automatic chord and key detection",
  provider: { "@type": "Organization", name: SITE_NAME },
  description:
    "Upload a song and get its key, BPM, and chord progression detected automatically — for guitar, piano, or any instrument.",
  url: absoluteUrl("/chord-detector"),
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    description: "Free, unlimited chord detection.",
  },
};


const HOW_IT_WORKS = [
  ["01", "Upload your track", "Any format — a rough phone recording works fine, doesn't need to be mastered first."],
  ["02", "We analyze it", "Real audio analysis (madmom for chords, Essentia for key and tempo) detects key, tempo, and the chord progression, section by section."],
  ["03", "Play along", "Chords sync to playback in real time — scroll through the progression as the track plays."],
];

const FAQ = [
  {
    question: "How accurate is it?",
    answer:
      "Estimated from the actual audio, not a database lookup — genuinely good on most recordings, but it's a starting point for the key and chords, not a guaranteed-accurate transcription. Complex jazz voicings or heavily distorted mixes are harder than a clean pop or acoustic recording.",
  },
  {
    question: "Do I need to master the track first?",
    answer:
      "No — chord detection is a separate tool from mastering. Upload a rough recording, a reference track, or a finished master; it works on any of them independently.",
  },
  {
    question: "Is this bundled with a mastering plan?",
    answer:
      "No — it's a separate, free tool. You don't need to master anything, subscribe, or pay anything to use it, whether or not you're on a mastering plan.",
  },
  {
    question: "Which chords does it recognise?",
    answer:
      "Every chord is reported as a major or minor triad with its start and end time — a Cmaj7 reads as C, an Am7 as Am. Passages with no clear harmony, like a drum break, are marked N.",
  },
];

const EDUCATION = [
  {
    title: "What you get from one upload",
    paragraphs: [
      "One analysis pass returns three things. The key — tonic plus major or minor — comes from Essentia's KeyExtractor, which matches the track's pitch-class profile against key templates. The tempo comes from Essentia's RhythmExtractor2013, which tracks beats across the whole file. Both carry a confidence reading. The chords come from madmom's deep-chroma recogniser, a neural network trained on annotated recordings, and are timed to the audio so they follow playback.",
    ],
  },
  {
    title: "Getting the most accurate result",
    paragraphs: ["The detector hears whatever is in the recording, so the cleaner the harmony, the cleaner the chart."],
    list: [
      "Use the full song rather than a clip, so the key and tempo are judged across every section.",
      "Lossless files (WAV, AIFF, FLAC) are ideal, but a good MP3 or phone recording works.",
      "Heavy distortion, dense jazz voicings and tracks without a steady pulse are the hardest cases — treat those results as a starting point.",
      "If the BPM looks exactly double or half what you expect, that is a half-time or double-time reading of the same groove, not a misread.",
    ],
  },
  {
    title: "How musicians use it",
    paragraphs: [
      "Guitarists and pianists learn songs by ear faster with the progression in front of them. Cover bands chart a setlist in minutes. Producers check what key a reference or sample is in before writing over it, and DJs use key and tempo to plan transitions. When your own track is ready, the same account masters it — adaptively, from what the audio needs.",
    ],
  },
];

export default function ChordDetectorPage() {
  return (
    <AnalyzeToolPage
      slug="chord-detector"
      toolKey="chord-detector"
      breadcrumbName="Chord Detector"
      eyebrow="Chord Detector · Free"
      h1="Online Chord Detector"
      lead="Know every chord in any song, in seconds. Upload a track and get its key, BPM, and chord progression back — real audio analysis, any instrument."
      focus="chords"
      toolLabel="Chord Detector"
      about={{
        title: "Works for guitar, piano, or any instrument",
        paragraphs: [
          "If it's in the recording, the engine hears it. Built for guitarists learning a song by ear, cover bands charting a setlist, and producers who just want to know what key a reference track is in.",
          "Completely free — no trial limit, no card, no subscription. Chord detection is free for every song, always.",
        ],
      }}
      steps={HOW_IT_WORKS}
      education={EDUCATION}
      faq={FAQ}
      nextLinks={[
        {
          title: "Once you know the chords, master the track",
          links: [
            ...CHORD_DETECTOR_RELATED_GENRES.map((g) => ({ href: `/master/${g}`, label: `How ${GENRE_PAGES[g].label.toLowerCase()} mastering adapts to your mix` })),
            { href: CTA.blog, label: "Mastering guides" },
          ],
        },
      ]}
      relatedKeys={[...TOOL_LANDING_KEYS, "lufs-meter"]}
      schemas={[SERVICE_JSONLD]}
      cta={{ title: "Analyze your track — it's free", body: "Key, BPM and the full chord progression from one upload.", primary: "Analyze a track" }}
    />
  );
}
