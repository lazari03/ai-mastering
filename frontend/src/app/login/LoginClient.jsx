"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuthStore } from "@/store/authStore";
import { useLanguage } from "@/lib/i18n";
import { scorePassword } from "@/lib/passwordStrength";

export default function LoginClient() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user, loading, busy, error, signIn, signUp, signInWithGoogle, clearError } = useAuthStore();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/app");
    }
  }, [loading, user, router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mode === "signup") {
      await signUp(email, password, { firstName, lastName, phone, termsAccepted });
    } else {
      await signIn(email, password);
    }
  };

  const fieldStyle =
    "w-full box-border rounded-xl border border-white/15 bg-black/20 px-3.5 py-3 text-sm text-white outline-none focus:border-brass/60";
  const isSignup = mode === "signup";
  const googleDisabled = busy || (isSignup && !termsAccepted);
  const passwordStrength = scorePassword(password);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-4 inline-block text-[13px] text-zinc-400 hover:text-zinc-200">
          ← {t("login.back")}
        </Link>

        <div
          className="reveal rounded-3xl border border-white/10 p-9"
          style={{
            background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))",
            boxShadow: "0 20px 60px rgba(0,0,0,.35)",
          }}
        >
          <p className="m-0 text-[11px] uppercase tracking-[0.22em] text-brass">{t("login.brand")}</p>
          <h1 className="mt-2.5 font-[var(--font-title)] text-2xl">
            {isSignup ? t("login.signup") : t("login.signin")}
          </h1>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {isSignup ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">{t("login.firstName")}</span>
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
                  <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">{t("login.lastName")}</span>
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
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">{t("login.email")}</span>
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
                <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">{t("login.phone")}</span>
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
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">{t("login.password")}</span>
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
                  <div className="flex h-1 w-full overflow-hidden rounded-full bg-white/10">
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
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-300">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  {t("login.termsPrefix")}{" "}
                  <Link href="/terms" target="_blank" className="text-brass hover:text-ember">
                    {t("login.termsLink")}
                  </Link>{" "}
                  {t("login.termsAnd")}{" "}
                  <Link href="/privacy" target="_blank" className="text-brass hover:text-ember">
                    {t("login.privacyLink")}
                  </Link>
                </span>
              </label>
            ) : null}

            {error ? <p className="m-0 text-sm text-red-300">{error}</p> : null}

            <button
              type="submit"
              disabled={busy || (isSignup && !termsAccepted)}
              className="w-full rounded-full border border-brass/50 bg-brass/[0.18] px-4 py-3.5 text-[13px] font-bold uppercase tracking-[0.14em] text-brass transition hover:bg-brass/25 disabled:opacity-50"
            >
              {busy ? t("login.working") : isSignup ? t("login.submitSignup") : t("login.submitSignin")}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
            <div className="h-px flex-1 bg-white/10" />
            {t("login.or")}
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle(termsAccepted)}
            disabled={googleDisabled}
            className="w-full rounded-full border border-white/15 bg-black/20 px-4 py-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:border-white/30 disabled:opacity-50"
          >
            {t("login.google")}
          </button>

          <button
            type="button"
            onClick={() => {
              clearError();
              setMode(isSignup ? "signin" : "signup");
            }}
            className="mt-5 block w-full bg-transparent text-center text-xs text-zinc-400 hover:text-zinc-200"
          >
            {isSignup ? t("login.toSignin") : t("login.toSignup")}
          </button>
        </div>
      </div>
    </main>
  );
}
