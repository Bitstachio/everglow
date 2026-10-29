/*
 * An invite opened before the person could open it (06.3): signed out, or
 * signed in but not onboarded yet. It waits here while they sign in and
 * finish onboarding, then the app opens its envelope. Kept in memory for the
 * session: it survives the sign-in browser and onboarding, not a restart.
 * App-wide, because the auth context routes on it and can't import features.
 */

let pendingToken: string | null = null;

export const savePendingInvite = (token: string) => {
  pendingToken = token;
};

/** The waiting invite's token, removed: it opens once. */
export const takePendingInvite = (): string | null => {
  const token = pendingToken;
  pendingToken = null;
  return token;
};

/** Forget it, for example when the account signs out. */
export const clearPendingInvite = () => {
  pendingToken = null;
};

/** Where to land once signed in and onboarded: the waiting envelope, or Home. */
export const takeLandingRoute = (): `/join/${string}` | "/events" => {
  const token = takePendingInvite();
  return token ? `/join/${encodeURIComponent(token)}` : "/events";
};
