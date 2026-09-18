"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { useAuthStore } from "@/store/authStore";
import { useLanguage } from "@/lib/i18n";
import { scorePassword } from "@/lib/passwordStrength";
import { Spinner } from "@/components/ui/Spinner";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { user, loading, busy, error, signIn, signUp, signInWithGoogle, clearError } = useAuthStore();
  // Set by client.js's SESSION_EXPIRED handling (absolute or inactivity
  // cap, see requireAuth.js) or by the client-side inactivity timer
  // (AuthInit.jsx) when it signs someone out proactively without waiting
  // for a request to 401 first — same query param, same message either way.
  const sessionExpired = searchParams.get("reason") === "session_expired";

  // Defaults to Sign In for a bare /login visit, but every "Master a Track
  // Free"/"Try it free"-style CTA site-wide links to /login?mode=signup
  // (see lib/internalLinks.js's CTA.signup) — those are all fresh-visitor
  // conversion moments, and landing them on Sign In first cost every one
  // an extra click to find the right tab.
  const [mode, setMode] = useState(() => (searchParams.get("mode") === "signup" ? "signup" : "signin")); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // ?redirect=/admin/analytics (or any other in-app path) sends someone
  // back where they actually meant to go instead of always landing on
  // /app — used by the admin dashboard's own auth gate (AdminAuthGate.jsx)
  // when it bounces a signed-out visitor here. Only ever a same-origin,
  // in-app path (starts with "/"), never an external redirect target.
  const redirectTo = searchParams.get("redirect");
  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/app");
    }
  }, [loading, user, router, redirectTo]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mode === "signup") {
      await signUp(email, password, { firstName, lastName, phone, termsAccepted });
    } else {
      await signIn(email, password);
    }
  };

  const fieldStyle =
    "w-full box-border rounded-xl border border-border-subtle bg-black/[0.045] px-3.5 py-3 text-sm text-text-primary outline-none focus:border-text-primary/30";
  const isSignup = mode === "signup";
  const googleDisabled = busy || (isSignup && !termsAccepted);
  const passwordStrength = scorePassword(password);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-4 inline-block text-[13px] text-text-secondary hover:text-text-primary">
          ← {t("login.back")}
        </Link>

        <div className="reveal rounded-3xl border border-border-subtle bg-bg p-9">
          <p className="m-0 text-[11px] uppercase tracking-[0.22em] text-accent">{t("login.brand")}</p>
          <h1 className="mt-2.5 text-2xl">
            {isSignup ? t("login.signup") : t("login.signin")}
          </h1>

          {sessionExpired ? (
            <p className="mt-3 rounded-lg border border-border-subtle bg-accent/[0.08] px-3 py-2.5 text-sm text-accent">
              {t("login.sessionExpired")}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {isSignup ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">{t("login.firstName")}</span>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={fieldStyle}
                    autoComplete="given-name"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">{t("login.lastName")}</span>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={fieldStyle}
                    autoComplete="family-name"
                  />
                </label>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">{t("login.email")}</span>
              <input
                type="email"
                required
                placeholder="you@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldStyle}
                autoComplete="email"
              />
            </label>

            {isSignup ? (
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">{t("login.phone")}</span>
                <input
                  type="tel"
                  required
                  placeholder="+355 6X XXX XXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldStyle}
                  autoComplete="tel"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">{t("login.password")}</span>
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldStyle}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
              {isSignup && password ? (
                <div className="mt-2">
                  <div className="flex h-1 w-full overflow-hidden rounded-full bg-black/[0.05]">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${passwordStrength.percent}%`, background: passwordStrength.color }}
                    />
                  </div>
                  <span className="mt-1 block text-[11px]" style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                </div>
              ) : null}
            </label>

            {isSignup ? (
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-text-secondary">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  {t("login.termsPrefix")}{" "}
                  <Link href="/terms" target="_blank" className="text-accent hover:text-accent">
                    {t("login.termsLink")}
                  </Link>{" "}
                  {t("login.termsAnd")}{" "}
                  <Link href="/privacy" target="_blank" className="text-accent hover:text-accent">
                    {t("login.privacyLink")}
                  </Link>
                </span>
              </label>
            ) : null}

            {error ? <p className="m-0 text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={busy || (isSignup && !termsAccepted)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border-subtle bg-black/[0.05] px-4 py-3.5 text-[13px] font-bold uppercase tracking-[0.14em] text-accent transition hover:bg-black/[0.06] disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Spinner size={13} /> {t("login.working")}
                </>
              ) : isSignup ? (
                t("login.submitSignup")
              ) : (
                t("login.submitSignin")
              )}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-text-secondary">
            <div className="h-px flex-1 bg-black/[0.05]" />
            {t("login.or")}
            <div className="h-px flex-1 bg-black/[0.05]" />
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle(termsAccepted)}
            disabled={googleDisabled}
            className="w-full rounded-full border border-border-subtle bg-black/[0.045] px-4 py-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-text-primary transition hover:border-text-primary/30 disabled:opacity-50"
          >
            {t("login.google")}
          </button>

          <button
            type="button"
            onClick={() => {
              clearError();
              setMode(isSignup ? "signin" : "signup");
            }}
            className="mt-5 block w-full bg-transparent text-center text-xs text-text-secondary hover:text-text-primary"
          >
            {isSignup ? t("login.toSignin") : t("login.toSignup")}
          </button>
        </div>
      </div>
    </main>
  );
}
