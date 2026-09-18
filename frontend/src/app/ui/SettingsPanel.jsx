"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getProfile, postProfile } from "@/network/http/client";
import { useAuthStore } from "@/store/authStore";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { PLANS } from "@/lib/pricing";
import { scorePassword } from "@/lib/passwordStrength";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

const fieldStyle =
  "w-full box-border rounded-xl border border-border-subtle bg-black/[0.03] px-3.5 py-3 text-sm text-text-primary outline-none focus:border-border-subtle";

export default function SettingsPanel({ onReplayTutorial, onOpenBilling }) {
  const { t } = useLanguage();
  const router = useRouter();
  const { plan: currentPlan, masterQuota, loaded: entitlementsLoaded } = useEntitlementsStore();
  const { user, busy, error, changePassword, deleteAccount, signOutEverywhere, clearError } = useAuthStore();
  const [signOutEverywhereStatus, setSignOutEverywhereStatus] = useState("");

  const [profile, setProfile] = useState({ firstName: "", lastName: "", phone: "", studioName: "" });
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  const isPasswordAccount = user?.providerData?.some((p) => p.providerId === "password");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    getProfile()
      .then((data) => {
        setProfile((prev) => ({ ...prev, ...data }));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaveStatus(t("settings.saving"));
    try {
      await postProfile(profile);
      setSaveStatus(t("settings.saved"));
    } catch (err) {
      setSaveStatus(err?.message || t("settings.saveFailed"));
    }
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    clearError();
    setPasswordStatus("");
    const ok = await changePassword(currentPassword, newPassword);
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus(t("settings.passwordUpdated"));
    }
  };

  const passwordStrength = scorePassword(newPassword);

  const canDelete = deleteConfirmText.trim().toUpperCase() === "DELETE" && (!isPasswordAccount || deletePassword);

  const submitDeleteAccount = async (event) => {
    event.preventDefault();
    clearError();
    const ok = await deleteAccount(deletePassword);
    if (ok) {
      router.replace("/");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1040px]">
      <h1 className="m-0 text-[26px]">{t("settings.title")}</h1>
      <p className="mt-2 text-sm text-text-secondary">{user?.email}</p>

      <div className="mt-2 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-5">
      {!loaded ? (
        <LoadingBlock />
      ) : (
        <form onSubmit={saveProfile} className="mt-6 flex flex-col gap-4 rounded-2xl border border-border-subtle bg-black/[0.03] p-5">
          <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-accent">{t("settings.profile")}</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">{t("settings.firstName")}</span>
              <input
                type="text"
                value={profile.firstName}
                onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                className={fieldStyle}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">{t("settings.lastName")}</span>
              <input
                type="text"
                value={profile.lastName}
                onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                className={fieldStyle}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">{t("settings.studioName")}</span>
            <input
              type="text"
              placeholder={t("settings.optional")}
              value={profile.studioName}
              onChange={(e) => setProfile((p) => ({ ...p, studioName: e.target.value }))}
              className={fieldStyle}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">{t("settings.phone")}</span>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              className={fieldStyle}
            />
          </label>

          <button
            type="submit"
            className="self-start rounded-full border border-border-subtle bg-black/[0.05] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-accent hover:bg-black/[0.06]"
          >
            {t("settings.saveProfile")}
          </button>
          {saveStatus ? <p className="m-0 text-xs text-text-secondary">{saveStatus}</p> : null}
        </form>
      )}

      <div className="rounded-2xl border border-border-subtle bg-black/[0.03] p-5">
        <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-accent">{t("billing.title")}</h2>
        {!entitlementsLoaded ? (
          <LoadingBlock />
        ) : (
          <>
            <p className="m-0 mt-2 text-sm text-text-primary">{PLANS[currentPlan]?.label || PLANS.free.label}</p>
            {masterQuota ? (
              <p className="m-0 mt-0.5 text-xs text-text-secondary">
                {t("billing.leftOf", { remaining: masterQuota.remaining, limit: masterQuota.limit })}
                {" · "}
                {masterQuota.resets ? t("billing.resetsNextMonth") : t("billing.oneTimeNoRenew")}
              </p>
            ) : null}
          </>
        )}
        {onOpenBilling ? (
          <button
            type="button"
            onClick={onOpenBilling}
            className="mt-3 rounded-full border border-border-subtle bg-black/[0.05] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-accent hover:bg-black/[0.06]"
          >
            {t("settings.managePlans")}
          </button>
        ) : null}
      </div>

      <form onSubmit={submitPasswordChange} className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-black/[0.03] p-5">
        <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-accent">{t("settings.changePassword")}</h2>

        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">{t("settings.currentPassword")}</span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={fieldStyle}
            autoComplete="current-password"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">{t("settings.newPassword")}</span>
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={fieldStyle}
            autoComplete="new-password"
          />
          {newPassword ? (
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

        {error ? <p className="m-0 text-sm text-red-300">{error}</p> : null}
        {passwordStatus ? <p className="m-0 text-sm text-accent">{passwordStatus}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 self-start rounded-full border border-border-subtle bg-black/[0.05] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-accent hover:bg-black/[0.06] disabled:opacity-50"
        >
          {busy ? (
            <>
              <Spinner size={12} /> {t("settings.updating")}
            </>
          ) : (
            t("settings.updatePassword")
          )}
        </button>
      </form>
      </div>

      <div className="flex flex-col gap-5">
      {onReplayTutorial ? (
        <div className="rounded-2xl border border-border-subtle bg-black/[0.03] p-5">
          <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-accent">{t("settings.help")}</h2>
          <p className="mt-2 text-sm text-text-secondary">{t("settings.wantRefresher")}</p>
          <button
            type="button"
            onClick={onReplayTutorial}
            className="mt-3 rounded-full border border-border-subtle bg-black/[0.03] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-text-primary hover:border-text-primary/30"
          >
            {t("settings.replayTutorial")}
          </button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border-subtle bg-black/[0.03] p-5">
        <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-accent">{t("settings.sessions")}</h2>
        <p className="mt-2 text-sm text-text-secondary">{t("settings.sessionsBody")}</p>
        {signOutEverywhereStatus ? <p className="mt-2 text-sm text-accent">{signOutEverywhereStatus}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setSignOutEverywhereStatus("");
            const ok = await signOutEverywhere();
            if (ok) {
              setSignOutEverywhereStatus(t("settings.signedOutRedirecting"));
              router.push("/login");
            }
          }}
          className="mt-3 flex items-center gap-2 rounded-full border border-border-subtle bg-black/[0.03] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-text-primary hover:border-text-primary/30 disabled:opacity-50"
        >
          {busy ? (
            <>
              <Spinner size={12} /> {t("settings.working")}
            </>
          ) : (
            t("settings.signOutAllDevices")
          )}
        </button>
      </div>

      <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5">
        <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-red-300">{t("settings.dangerZone")}</h2>
        <p className="mt-2 text-sm text-text-secondary">{t("settings.dangerBody")}</p>

        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => {
              clearError();
              setDeleteOpen(true);
            }}
            className="mt-3 rounded-full border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-red-300 hover:bg-red-500/20"
          >
            {t("settings.deleteAccount")}
          </button>
        ) : (
          <form onSubmit={submitDeleteAccount} className="mt-3 flex flex-col gap-3">
            {isPasswordAccount ? (
              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">{t("settings.currentPassword")}</span>
                <input
                  type="password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className={fieldStyle}
                  autoComplete="current-password"
                />
              </label>
            ) : (
              <p className="m-0 text-xs text-text-secondary">{t("settings.googleConfirm")}</p>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-text-secondary">
                {t("settings.typeDelete")}
              </span>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className={fieldStyle}
                placeholder="DELETE"
              />
            </label>

            {error ? <p className="m-0 text-sm text-red-300">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!canDelete || busy}
                className="flex items-center gap-2 rounded-full border border-red-500/50 bg-red-500/20 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-red-200 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <Spinner size={12} /> {t("settings.deleting")}
                  </>
                ) : (
                  t("settings.permanentlyDelete")
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirmText("");
                  setDeletePassword("");
                  clearError();
                }}
                className="rounded-full border border-border-subtle bg-black/[0.03] px-5 py-2.5 text-xs uppercase tracking-[0.1em] text-text-secondary hover:border-text-primary/30"
              >
                {t("settings.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
