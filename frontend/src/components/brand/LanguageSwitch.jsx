"use client";

import { useEffect, useRef, useState } from "react";

const LANGS = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "sq", flag: "🇦🇱", label: "Shqip" },
];

// Compact flag-only toggle: shows the current language's flag, click opens
// a small popover to pick the other one. Two languages don't need a full
// dropdown list open by default — a single glyph is the smallest possible
// affordance, the popover only appears on demand.
export default function LanguageSwitch({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGS.find((l) => l.code === lang) || LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
        title={current.label}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/20 text-base leading-none transition hover:border-white/30"
      >
        {current.flag}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1.5 flex flex-col overflow-hidden rounded-xl border border-white/15 bg-[#15181c] shadow-lg">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              aria-pressed={l.code === lang}
              className={`flex items-center gap-2 px-3 py-2 text-left text-xs whitespace-nowrap transition ${
                l.code === lang ? "bg-brass/20 text-brass" : "text-zinc-300 hover:bg-white/5"
              }`}
            >
              <span className="text-base leading-none">{l.flag}</span>
              {l.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
