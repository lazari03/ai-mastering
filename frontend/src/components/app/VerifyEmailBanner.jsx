"use client";

import { useEffect, useState } from "react";

import { useAuthStore } from "@/store/authStore";
import { useLanguage } from "@/lib/i18n";

// Mirrors the backend's requiresEmailVerification (backend-node's auth.js):
// shown only to a password-account user with an unverified email (Google
// sign-in arrives pre-verified). A warning, not a gate — mastering and
// checkout work while unverified — so it stays persistent and points at
// the spam folder, where most "I never got it" verification mails end up.
export default function VerifyEmailBanner() {
  const { t } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const resendVerificationEmail = useAuthStore((s) => s.resendVerificationEmail);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const emailVerified = useAuthStore((s) => s.emailVerified);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPasswordAccount = user?.providerData?.some((p) => p.providerId === "password");
  const showBanner = isPasswordAccount && !emailVerified && !user?.emailVerified;

  // The verification link opens in another tab or the mail app; when the
  // user comes back here, check silently so the banner clears on its own
  // instead of waiting for a click on "I've verified".
  useEffect(() => {
    if (!showBanner) return undefined;
    const onFocus = () => {
      if (document.visibilityState === "visible") refreshUser().catch(() => {});
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [showBanner, refreshUser]);

  if (!showBanner) return null;

  const handleResend = async () => {
    setBusy(true);
    const ok = await resendVerificationEmail();
    setBusy(false);
    if (ok) setSent(true);
  };

  const handleRefresh = async () => {
    setBusy(true);
    try {
      await refreshUser();
    } finally {
      setBusy(false);
    }
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
