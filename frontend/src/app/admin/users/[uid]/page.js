"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { getAdminUsers, postSendPasswordReset, postSetUserDisabled, postResyncSubscription } from "@/network/http/client";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";

function Field({ label, value }) {
  return (
    <div>
      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-white">{value ?? "—"}</p>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [resetStatus, setResetStatus] = useState(""); // "" | "sending" | "sent" | error message
  const [disableBusy, setDisableBusy] = useState(false);
  const [resyncStatus, setResyncStatus] = useState(""); // "" | "syncing" | "synced" | error message

  const load = () => {
    setError("");
    getAdminUsers(`/${params.uid}`)
      .then(setUser)
      .catch((err) => setError(err?.message || "Failed to load user."));
  };

  useEffect(load, [params.uid]);

  const sendReset = async () => {
    setResetStatus("sending");
    try {
      await postSendPasswordReset(params.uid);
      setResetStatus("sent");
    } catch (err) {
      setResetStatus(err?.message || "Failed to send reset link.");
    }
  };

  const resyncSubscription = async () => {
    setResyncStatus("syncing");
    try {
      await postResyncSubscription(params.uid);
      setResyncStatus("synced");
      load();
    } catch (err) {
      setResyncStatus(err?.message || "Failed to resync from Polar.");
    }
  };

  const toggleDisabled = async () => {
    setDisableBusy(true);
    try {
      await postSetUserDisabled(params.uid, !user.disabled);
      load();
    } catch (err) {
      setError(err?.message || "Failed to update account status.");
    } finally {
      setDisableBusy(false);
    }
  };

  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!user) return <LoadingBlock />;

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Users
      </Link>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-lg font-bold text-white">{user.email || "(no email)"}</h1>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
              user.disabled ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {user.disabled ? "Disabled" : "Active"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="First Name" value={user.firstName} />
          <Field label="Last Name" value={user.lastName} />
          <Field label="Phone" value={user.phone} />
          <Field label="Studio" value={user.studioName} />
          <Field label="Plan" value={user.plan} />
          <Field label="Role" value={user.role || "user"} />
          <Field label="Email Verified" value={user.emailVerified ? "Yes" : "No"} />
          <Field label="Joined" value={user.creationTime ? new Date(user.creationTime).toLocaleString() : null} />
          <Field label="Last Sign-in" value={user.lastSignInTime ? new Date(user.lastSignInTime).toLocaleString() : null} />
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">Subscription</p>
            <button
              type="button"
              onClick={resyncSubscription}
              disabled={resyncStatus === "syncing"}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-300 hover:border-white/30 disabled:opacity-50"
            >
              {resyncStatus === "syncing" ? <Spinner size={11} /> : null} Resync from Polar
            </button>
          </div>
          {user.subscription ? (
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Status" value={user.subscription.status} />
              <Field label="Product" value={user.subscription.productId} />
              <Field
                label="Current Period End"
                value={user.subscription.currentPeriodEnd ? new Date(user.subscription.currentPeriodEnd).toLocaleDateString() : null}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">
              No subscription on file in Firestore. If this user has an active plan in Polar that isn&apos;t reflected here (a missed
              webhook), use Resync from Polar to pull it in directly.
            </p>
          )}
          {resyncStatus === "synced" ? <p className="mt-2 text-xs text-emerald-300">Synced from Polar.</p> : null}
          {resyncStatus && resyncStatus !== "syncing" && resyncStatus !== "synced" ? <p className="mt-2 text-xs text-red-300">{resyncStatus}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="m-0 text-sm text-white">Send password reset</p>
          <p className="mt-1 text-xs text-zinc-500">Emails a reset link directly to the user.</p>
          <button
            type="button"
            onClick={sendReset}
            disabled={resetStatus === "sending"}
            className="mt-3 flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
          >
            {resetStatus === "sending" ? <Spinner size={12} /> : null} Send Reset Link
          </button>
          {resetStatus === "sent" ? <p className="mt-2 text-xs text-emerald-300">Sent.</p> : null}
          {resetStatus && resetStatus !== "sending" && resetStatus !== "sent" ? <p className="mt-2 text-xs text-red-300">{resetStatus}</p> : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="m-0 text-sm text-white">{user.disabled ? "Re-enable login" : "Disable login"}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {user.disabled ? "Restores this account's ability to sign in." : "Immediately blocks sign-in and revokes existing sessions."}
          </p>
          <button
            type="button"
            onClick={toggleDisabled}
            disabled={disableBusy}
            className={`mt-3 flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] disabled:opacity-50 ${
              user.disabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            }`}
          >
            {disableBusy ? <Spinner size={12} /> : null} {user.disabled ? "Re-enable" : "Disable"}
          </button>
        </div>
      </div>
    </div>
  );
}
