"use client";

import { useState } from "react";

import { postNewsletterSubscribe } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";

// Reusable across the site — the same widget backs the footer's compact
// version (every marketing page, via Footer.jsx) and the dedicated
// /newsletter landing page (a bigger `size="lg"` copy of the same form).
// One backend route, one component, no duplicated subscribe logic.
export default function NewsletterWidget({ source = "footer", size = "sm" }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | busy | done | error
  const [error, setError] = useState("");
  const [discountCode, setDiscountCode] = useState(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus("busy");
    setError("");
    try {
      const { discountCode: code } = await postNewsletterSubscribe(email.trim(), source);
      setDiscountCode(code);
      setStatus("done");
    } catch (err) {
      setError(err?.message || t("newsletter.error"));
      setStatus("error");
    }
  };

  const copyCode = async () => {
    if (!discountCode) return;
    try {
      await navigator.clipboard.writeText(discountCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the code is still visible to copy by hand.
    }
  };

  if (status === "done") {
    return (
      <div className={size === "lg" ? "rounded-2xl border border-brass/30 bg-brass/[0.06] p-6" : "rounded-xl border border-brass/25 bg-brass/[0.06] p-4"}>
        <p className="m-0 text-sm font-semibold text-brass">{t("newsletter.subscribed.title")}</p>
        {discountCode ? (
          <>
            <p className="mt-1.5 text-xs text-zinc-300">{t("newsletter.subscribed.withCode")}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-bold tracking-[0.08em] text-white">
                {discountCode}
              </code>
              <button
                type="button"
                onClick={copyCode}
                className="rounded-lg border border-brass/40 bg-brass/[0.18] px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/25"
              >
                {copied ? t("newsletter.copied") : t("newsletter.copy")}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-xs text-zinc-400">{t("newsletter.subscribed.pending")}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={size === "lg" ? "flex flex-col gap-3 sm:flex-row" : "flex flex-col gap-2 sm:flex-row"}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("newsletter.emailPlaceholder")}
        className={`min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 text-sm text-white placeholder:text-zinc-500 ${
          size === "lg" ? "px-4 py-3" : "px-3 py-2"
        }`}
      />
      <button
        type="submit"
        disabled={status === "busy"}
        className={`shrink-0 rounded-lg bg-gradient-to-br from-ember to-brass font-bold uppercase tracking-[0.1em] text-[#100b08] transition hover:brightness-110 disabled:opacity-50 ${
          size === "lg" ? "px-6 py-3 text-sm" : "px-4 py-2 text-[11px]"
        }`}
      >
        {status === "busy" ? t("newsletter.submitting") : t("newsletter.submit")}
      </button>
      {error ? <p className="text-xs text-red-300 sm:basis-full">{error}</p> : null}
    </form>
  );
}
