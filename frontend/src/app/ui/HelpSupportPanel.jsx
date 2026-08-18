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

export default function HelpSupportPanel() {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">Help &amp; Support</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">
        Answers to the things people actually get stuck on while using the app.
      </p>

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
