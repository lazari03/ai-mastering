"use client";

import { useState } from "react";

import { useAuthStore } from "@/store/authStore";
import { useLanguage } from "@/lib/i18n";

// Mirrors the backend's requiresEmailVerification (backend-node's auth.js):
// only a password-account user with an unverified email is gated — Google
// sign-in arrives pre-verified, and an anonymous session has no real email
// yet. Shown persistently (not dismissible) since it names a real,
// standing restriction (mastering/checkout are blocked server-side), not a
// one-time announcement.
export default function VerifyEmailBanner() {
  const { t } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const resendVerificationEmail = useAuthStore((s) => s.resendVerificationEmail);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPasswordAccount = user?.providerData?.some((p) => p.providerId === "password");
  if (!isPasswordAccount || user?.emailVerified) return null;

  const handleResend = async () => {
    setBusy(true);
    const ok = await resendVerificationEmail();
    setBusy(false);
    if (ok) setSent(true);
  };

  const handleRefresh = async () => {
    setBusy(true);
    await refreshUser();
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border-subtle bg-accent/[0.08] px-4 py-2 text-center text-xs text-text-primary sm:text-sm">
      <p className="m-0">{t("app.verifyEmail.message")}</p>
      <button type="button" onClick={handleResend} disabled={busy} className="font-semibold underline underline-offset-2 disabled:opacity-50">
        {sent ? t("app.verifyEmail.resent") : t("app.verifyEmail.resend")}
      </button>
      <button type="button" onClick={handleRefresh} disabled={busy} className="font-semibold underline underline-offset-2 disabled:opacity-50">
        {t("app.verifyEmail.refresh")}
      </button>
    </div>
  );
}
