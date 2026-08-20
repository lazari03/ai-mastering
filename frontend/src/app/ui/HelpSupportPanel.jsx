"use client";

import { useState } from "react";
import Link from "next/link";

const TOPICS = [
  {
    q: "My master sounds mono even though I have stereo speakers",
    a: "If the file you uploaded is itself mono (or near-mono), the output is mathematically mono too — mastering can't invent stereo information that was never in the source. The report panel flags this automatically after a render so it's never a silent surprise.",
  },
  {
    q: "Where did my file go? I can't download it anymore.",
    a: "Uploaded files, masters, and codec previews are automatically deleted 48 hours after you create them (see the Refund/Privacy policy) — this app doesn't offer long-term audio storage. Check My Masters for what's still inside the window, and download what you need before it expires.",
  },
  {
    q: "What's the difference between Standard and Professional?",
    a: "Standard is the free, default engine. Professional adds oversampled true-peak limiting, finer dynamic EQ, and tempo-aware compression timing — pick it from the Engine dropdown when mastering.",
  },
  {
    q: "How do I reuse the same mastering chain for an artist's next release?",
    a: "Import a full preset JSON under Saved Artists (in the Master Audio tab) once, then pick that artist from the dropdown on every future track — it's applied exactly as saved, and it's private to your account.",
  },
  {
    q: "A render has been stuck on \"Mastering…\" for a while",
    a: "Renders with stem separation enabled can take a minute or two — that's expected. If it's been much longer than that, refresh the page; the notification banner and My Masters tab will still show the result once it lands.",
  },
  {
    q: "Can I get my old mastered file back after it expired?",
    a: "No — once a file passes the 48-hour retention window it's permanently gone from our servers, by design (see Privacy Policy). Re-upload the original and master it again.",
  },
];

// Fed verbatim to ChatGPT (or any LLM) along with the template JSON and the
// user's own description of the sound they want — asks for output shaped
// exactly like frontend/public/artist-preset-template.json, which is also
// exactly what backend-node's parseImportedPreset()/preset_dsp_engine expect.
// Keeping the enum lists (genre/style/tags) here means the LLM never has to
// guess at valid values.
const MASTER_PROMPT = `You are creating a mastering preset for an AI audio mastering app called Auralith Forge. I will describe the sound I want, and you will output ONLY a single JSON object — no explanation, no markdown code fences, no extra text before or after it.

Match this exact structure (same keys, same nesting):

{
  "display_name": "<a short name for this preset>",
  "genre": "<one of: pop, hiphop, rock, edm, acoustic, lofi, podcast, classical>",
  "style": "<one of: modern, rock_90s, rock_2000s, rock_modern, electronic_modern, stock_mastering_strip>",
  "tags": [<zero or more of: "better_vocals", "deeper", "brighter", "warmer", "louder", "wider", "punchier_drums", "clearer", "softer">],
  "output_format": "wav",
  "processing": {
    "input": { "auto_gain": true, "headroom_target_db": -6 },
    "highpass": { "enabled": false, "frequency_hz": 30, "slope_db_oct": 12 },
    "eq": [
      { "frequency_hz": <20-20000>, "gain_db": <-12 to 12>, "q": <0.3-8> }
    ],
    "bus_compressor": { "ratio": <1-8>, "attack_ms": <1-100>, "release_ms": <30-500>, "max_gain_reduction_db": <0-12> },
    "dynamic_eq": [],
    "saturation": { "enabled": <true|false>, "amount": <0-0.15>, "oversampling": 4 },
    "stereo": { "low_end_mono_below_hz": <60-200>, "bands": [] },
    "clipper": { "enabled": <true|false>, "ceiling_dbtp": <-3 to -0.3>, "drive_db": <0-6>, "oversampling": 4 },
    "limiter": { "target_lufs_i": <-16 to -6>, "ceiling_dbtp": <-2 to -0.3> },
    "output": { "bit_depth": 24, "dither": "triangular" }
  }
}

Rules:
- "eq" can have as many bands as needed (typically 3-6) — each one shapes a frequency range, "gain_db" positive boosts / negative cuts.
- Louder, more aggressive, "radio ready" sounds want a higher (less negative) "target_lufs_i", more "max_gain_reduction_db", and often the clipper enabled.
- Quieter, more dynamic, "audiophile"/"vinyl" sounds want a lower (more negative) "target_lufs_i", less compression, clipper disabled.
- "warmer"/"vintage" sounds want a touch of saturation enabled.
- "wider" sounds want a lower "low_end_mono_below_hz" and, if you add stereo bands, wider settings on the high end.
- Use real mastering judgment for the exact numbers based on my description below — don't just copy the ranges' midpoints.

Here is the sound I want:
"<describe the artist/reference sound, energy, genre, loudness, warmth, width, etc. here>"`;

function Item({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-sm font-semibold text-white">{q}</span>
        <span className={`shrink-0 text-brass transition-transform ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      {open ? <p className="mt-2 text-sm leading-relaxed text-zinc-300">{a}</p> : null}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg border border-brass/40 bg-brass/[0.12] px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/20"
    >
      {copied ? "Copied!" : "Copy prompt"}
    </button>
  );
}

export default function HelpSupportPanel() {
  return (
    <div id="help-import-preset" className="mx-auto w-full max-w-[720px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">Help &amp; Support</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">
        Answers to the things people actually get stuck on while using the app.
      </p>

      <div className="mt-6 rounded-2xl border border-brass/25 bg-brass/[0.06] p-5">
        <h2 className="m-0 text-sm font-semibold text-white">Create a custom artist preset with ChatGPT</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
          You don&apos;t have to set every knob by hand — describe the sound you want to an AI chat assistant and
          import what it gives you back.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
          <li>
            <a href="/artist-preset-template.json" download className="text-brass hover:text-ember">
              Download the template JSON
            </a>{" "}
            — this shows the exact shape the app expects.
          </li>
          <li>
            Copy the master prompt below into ChatGPT (or any AI chat), and replace the last line with your own
            description of the sound you want (an artist reference, genre, how loud/warm/wide, etc).
          </li>
          <li>Save what it gives you back as a <code className="text-zinc-200">.json</code> file.</li>
          <li>
            In <span className="text-zinc-200">Master Audio → Saved Artists → Import Preset JSON</span>, give it an
            artist name and upload that file. It&apos;s saved to your account and ready to reuse on every future track.
          </li>
        </ol>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">Master prompt</span>
          <CopyButton text={MASTER_PROMPT} />
        </div>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-300">
          {MASTER_PROMPT}
        </pre>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {TOPICS.map((topic) => (
          <Item key={topic.q} q={topic.q} a={topic.a} />
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-brass/25 bg-brass/[0.06] p-5">
        <h2 className="m-0 text-sm font-semibold text-white">Still stuck?</h2>
        <p className="mt-1.5 text-sm text-zinc-300">
          Email{" "}
          <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">
            studio@auralithforge.app
          </a>{" "}
          — include your account email and, if it's about a specific render, roughly when you ran it.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-400">
          <Link href="/blog" target="_blank" className="hover:text-zinc-200">Mastering guides →</Link>
          <Link href="/terms" target="_blank" className="hover:text-zinc-200">Terms & Conditions →</Link>
          <Link href="/privacy" target="_blank" className="hover:text-zinc-200">Privacy Policy →</Link>
          <Link href="/refund" target="_blank" className="hover:text-zinc-200">Refund Policy →</Link>
        </div>
      </div>
    </div>
  );
}
