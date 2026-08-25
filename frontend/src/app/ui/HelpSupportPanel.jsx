"use client";

import { useState } from "react";
import Link from "next/link";

import { useLanguage } from "@/lib/i18n";

const TOPIC_KEYS = ["topic1", "topic2", "topic3", "topic4", "topic5", "topic6"];

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
  "genre": "<one of: pop, hiphop, rock, edm, acoustic, lofi, podcast, classical, metal, trap, rnb, reggaeton, latin, house, techno, dnb, afrobeats, singer_songwriter, jazz, cinematic>",
  "style": "<one of: modern, rock_90s, rock_2000s, rock_modern, electronic_modern, stock_mastering_strip, vintage_analog, cd_loudness_war, vinyl_master, streaming_safe, hiphop_golden_era, hiphop_modern_trap, pop_80s, edm_festival, acoustic_natural, cinematic_score>",
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

function CopyButton({ text, label, copiedLabel }) {
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
      {copied ? copiedLabel : label}
    </button>
  );
}

export default function HelpSupportPanel() {
  const { t } = useLanguage();

  return (
    <div id="help-import-preset" className="mx-auto w-full max-w-[720px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">{t("help.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{t("help.subtitle")}</p>

      <div className="mt-6 rounded-2xl border border-brass/25 bg-brass/[0.06] p-5">
        <h2 className="m-0 text-sm font-semibold text-white">{t("help.chatgptTitle")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{t("help.chatgptBody")}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
          <li>
            <a href="/artist-preset-template.json" download className="text-brass hover:text-ember">
              {t("help.step1")}
            </a>{" "}
            {t("help.step1tail")}
          </li>
          <li>{t("help.step2")}</li>
          <li>
            {t("help.step3")} <code className="text-zinc-200">.json</code> {t("help.step3tail")}
          </li>
          <li>
            {t("help.step4pre")} <span className="text-zinc-200">{t("help.step4path")}</span>
            {t("help.step4tail")}
          </li>
        </ol>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">{t("help.masterPrompt")}</span>
          <CopyButton text={MASTER_PROMPT} label={t("help.copyPrompt")} copiedLabel={t("help.copied")} />
        </div>
        {/* MASTER_PROMPT stays English-only — it's fed verbatim to an LLM
            and must match the app's real JSON schema/enum values exactly;
            translating it would break the thing it's for. */}
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-300">
          {MASTER_PROMPT}
        </pre>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {TOPIC_KEYS.map((key) => (
          <Item key={key} q={t(`help.${key}.q`)} a={t(`help.${key}.a`)} />
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-brass/25 bg-brass/[0.06] p-5">
        <h2 className="m-0 text-sm font-semibold text-white">{t("help.stillStuck")}</h2>
        <p className="mt-1.5 text-sm text-zinc-300">
          {t("help.emailIntro")}{" "}
          <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">
            studio@auralithforge.app
          </a>{" "}
          {t("help.emailTail")}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-400">
          <Link href="/blog" target="_blank" className="hover:text-zinc-200">{t("help.guides")}</Link>
          <Link href="/terms" target="_blank" className="hover:text-zinc-200">{t("help.terms")}</Link>
          <Link href="/privacy" target="_blank" className="hover:text-zinc-200">{t("help.privacy")}</Link>
          <Link href="/refund" target="_blank" className="hover:text-zinc-200">{t("help.refund")}</Link>
        </div>
      </div>
    </div>
  );
}
