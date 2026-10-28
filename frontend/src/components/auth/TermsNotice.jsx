"use client";

import Link from "next/link";

import { useLanguage } from "@/lib/i18n";

// Clickwrap consent shown above the sign-up / Google buttons. Replaces the
// required checkbox: the box blocked the email submit AND greyed out
// "Continue with Google", and on the Sign In tab a brand-new Google user was
// created, then signed straight back out with a "you must accept the
// terms" error. Pressing a button under this notice is the acceptance —
// callers pass termsAccepted: true and the timestamp/version are still
// recorded on the profile (authStore.js).
export default function TermsNotice({ className = "" }) {
  const { t } = useLanguage();
  return (
    <p className={`m-0 text-xs leading-relaxed text-text-secondary ${className}`}>
      {t("login.termsContinue")}{" "}
      <Link href="/terms" target="_blank" className="text-link">
        {t("login.termsLink")}
      </Link>{" "}
      {t("login.termsAnd")}{" "}
      <Link href="/privacy" target="_blank" className="text-link">
        {t("login.privacyLink")}
      </Link>
      .
    </p>
  );
}
