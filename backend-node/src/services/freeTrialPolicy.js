// New signup offer. Existing accounts retain the allowance they joined with.
// Server-owned createdAt is written by profileService, never accepted from clients.
export const FREE_TRIAL_CHANGED_AT = Date.parse("2026-11-17T00:00:00Z");
export function freeTrialLimit(data = {}) {
  if (data.freeMasterTrialLimit === 1 || data.freeMasterTrialLimit === 3) return data.freeMasterTrialLimit;
  const value = data.createdAt;
  const created = value?.toDate ? value.toDate() : value;
  const ms = created ? new Date(created).getTime() : NaN;
  // A missing profile cannot bypass the new allowance. Old accounts with a
  // usage record but no signup timestamp retain their original trial.
  if ((Number.isFinite(ms) && ms < FREE_TRIAL_CHANGED_AT) ||
      (!Number.isFinite(ms) && data.freeMasterUsage !== undefined)) return 3;
  return 1;
}
