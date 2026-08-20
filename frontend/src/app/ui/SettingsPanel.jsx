"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getProfile, postProfile } from "@/network/http/client";
import { useAuthStore } from "@/store/authStore";
import { scorePassword } from "@/lib/passwordStrength";
import BillingPanel from "./BillingPanel";

const fieldStyle =
  "w-full box-border rounded-xl border border-white/15 bg-black/20 px-3.5 py-3 text-sm text-white outline-none focus:border-brass/60";

export default function SettingsPanel({ onReplayTutorial }) {
  const router = useRouter();
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
    setSaveStatus("Saving…");
    try {
      await postProfile(profile);
      setSaveStatus("Saved.");
    } catch (err) {
      setSaveStatus(err?.message || "Failed to save.");
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
      setPasswordStatus("Password updated.");
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
    <div className="mx-auto w-full max-w-[560px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">Settings</h1>
      <p className="mt-2 text-sm text-zinc-300">{user?.email}</p>

      {!loaded ? (
        <p className="mt-4 text-xs text-zinc-400">Loading…</p>
      ) : (
        <form onSubmit={saveProfile} className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-5">
          <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-brass">Profile</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">First name</span>
              <input
                type="text"
                value={profile.firstName}
                onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                className={fieldStyle}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">Last name</span>
              <input
                type="text"
                value={profile.lastName}
                onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                className={fieldStyle}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">Studio name</span>
            <input
              type="text"
              placeholder="Optional"
              value={profile.studioName}
              onChange={(e) => setProfile((p) => ({ ...p, studioName: e.target.value }))}
              className={fieldStyle}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">Phone number</span>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              className={fieldStyle}
            />
          </label>

          <button
            type="submit"
            className="self-start rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            Save profile
          </button>
          {saveStatus ? <p className="m-0 text-xs text-zinc-400">{saveStatus}</p> : null}
        </form>
      )}

      <div className="mt-5">
        <BillingPanel />
      </div>

      <form onSubmit={submitPasswordChange} className="mt-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-5">
        <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-brass">Change password</h2>

        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">Current password</span>
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
          <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">New password</span>
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

        {error ? <p className="m-0 text-sm text-red-300">{error}</p> : null}
        {passwordStatus ? <p className="m-0 text-sm text-brass">{passwordStatus}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-brass hover:bg-brass/25 disabled:opacity-50"
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>

      {onReplayTutorial ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
          <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-brass">Help</h2>
          <p className="mt-2 text-sm text-zinc-400">Want a refresher on how the app works?</p>
          <button
            type="button"
            onClick={onReplayTutorial}
            className="mt-3 rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 hover:border-white/35"
          >
            Replay tutorial
          </button>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
        <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-brass">Sessions</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Signed-in sessions expire automatically after 14 days. If you signed in on a device you don&apos;t
          recognize, or just want to be sure, you can end every other signed-in session right now.
        </p>
        {signOutEverywhereStatus ? <p className="mt-2 text-sm text-brass">{signOutEverywhereStatus}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setSignOutEverywhereStatus("");
            const ok = await signOutEverywhere();
            if (ok) {
              setSignOutEverywhereStatus("Signed out everywhere. Redirecting…");
              router.push("/login");
            }
          }}
          className="mt-3 rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 hover:border-white/35 disabled:opacity-50"
        >
          {busy ? "Working…" : "Sign out of all devices"}
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5">
        <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-red-300">Danger zone</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Permanently deletes your account, profile, Saved Artists, and render history. This can&apos;t be undone.
        </p>

        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => {
              clearError();
              setDeleteOpen(true);
            }}
            className="mt-3 rounded-full border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-red-300 hover:bg-red-500/20"
          >
            Delete account
          </button>
        ) : (
          <form onSubmit={submitDeleteAccount} className="mt-3 flex flex-col gap-3">
            {isPasswordAccount ? (
              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">Current password</span>
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
              <p className="m-0 text-xs text-zinc-500">You&apos;ll be asked to confirm with Google before this completes.</p>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">
                Type DELETE to confirm
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
                className="rounded-full border border-red-500/50 bg-red-500/20 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-red-200 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Permanently delete my account"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirmText("");
                  setDeletePassword("");
                  clearError();
                }}
                className="rounded-full border border-white/15 bg-black/20 px-5 py-2.5 text-xs uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
