import HomeClient from "./HomeClient";
import { buildMetadata, organizationJsonLd, faqJsonLd, JsonLd } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Master Your Music Online — AI Audio Mastering with a Real DSP Engine | Auralith Forge",
  description:
    "Master your tracks online with an adaptive DSP engine — analysis-first EQ, compression, saturation, stereo imaging, and true-peak limiting. Free Standard tier, genre-aware presets, and saved artist mastering chains.",
  path: "/",
  keywords: [
    "mastering online",
    "master a song online free",
    "online audio mastering",
    "AI mastering software",
    "professional audio mastering",
    "online mastering studio",
    "genre mastering presets",
  ],
});

// English only — kept as plain strings here (not imported from lib/i18n's
// DICT) rather than pulling a "use client" module's data into a server
// component just to read 8 strings; same real copy the homepage FAQ
// section renders (see i18n.js "faq.q1".."faq.a8"), just duplicated once
// for the schema rather than adding an import-boundary complication.
const FAQ_ITEMS = [
  {
    question: "What file formats are supported?",
    answer:
      "Common audio formats (WAV, MP3, FLAC, AIFF, and more) are accepted on upload and decoded automatically before processing. Final export is WAV or MP3.",
  },
  {
    question: "What's the difference between Standard and Professional?",
    answer:
      "Standard applies fast, safe adaptive mastering — 3 full-length renders a month are free. Professional adds oversampled true-peak limiting, finer dynamic EQ, and tempo-aware compression timing for release-grade results, unlocked (along with a much higher monthly limit) on the Studio plan or higher.",
  },
  {
    question: "Can I save an artist's exact mastering chain?",
    answer:
      "Yes — import a full preset JSON under Saved Artists (genre, style, and a processing spec), and apply it to any future track from a dropdown, run exactly as written. It's private to your account.",
  },
  {
    question: "Why does my mono source sound mono after mastering?",
    answer:
      "If the uploaded file itself is mono (or near-mono), the output is mathematically mono too — mastering doesn't fabricate stereo information that was never there.",
  },
  {
    question: "Is stem separation available?",
    answer:
      "Yes — enable stem-aware processing to master vocals, drums, bass, and other elements with independent, more targeted control. Included free with the Studio plan or higher.",
  },
  {
    question: "Can I hear how it'll sound on Spotify or Instagram before downloading?",
    answer:
      "Yes — Codec Preview runs a real MP3/AAC/Opus encode-decode round-trip on your mastered file and reports the true-peak, loudness, and high-frequency changes it caused.",
  },
  {
    question: "Is my music private?",
    answer:
      "Every route except the public landing page requires a signed-in account, and Saved Artist presets are stored per-user — no one else using the app sees your uploads or your artist chains.",
  },
  {
    question: "What's actually free?",
    answer:
      "30-second mastering previews (unlimited, Standard engine) and 3 full-length masters total, free — a one-time trial, not renewed monthly. Single masters are €2.99 each after that.",
  },
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />
      <HomeClient />
    </>
  );
}
