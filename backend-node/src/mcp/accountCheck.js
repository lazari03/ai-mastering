import { getAuth } from "../config/firebase.js";

// Is this Firebase account still allowed to hold an MCP grant made at
// `grantCreatedAtMs`? Used on every refresh-token exchange. Throws on a
// transient Google API failure (the caller answers "temporarily
// unavailable" rather than revoking a healthy connection over a blip).
export async function checkFirebaseUser(uid, grantCreatedAtMs) {
  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return { ok: false, reason: "account_deleted" };
    throw error;
  }
  if (user.disabled) return { ok: false, reason: "account_disabled" };
  // Set by revokeRefreshTokens() — "sign out of all devices", password
  // changes and admin disables all go through it (masteringRoutes.js,
  // adminUsersService.js). A grant older than that cut-off is revoked too.
  const validAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : NaN;
  if (Number.isFinite(validAfter) && validAfter > grantCreatedAtMs) return { ok: false, reason: "sessions_revoked" };
  return { ok: true };
}
