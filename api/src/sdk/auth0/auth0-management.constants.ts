/**
 * How long a password-change link works. Minted for the person in the app and
 * opened straight away, so five minutes is plenty; Auth0's default (five days)
 * would let one stolen access token mint a link that outlives it by days.
 */
export const PASSWORD_CHANGE_TICKET_TTL_SECONDS = 300;

export const AUTH0_MANAGEMENT_ERRORS = {
  CREDENTIALS_NOT_CONFIGURED: () => "Auth0 Management API credentials are not configured",
  PASSWORD_CHANGE_TICKET_NOT_CONFIGURED: () =>
    "Auth0 password-change ticket settings are not configured (native client id)",
  // Logged as the request's errorReason: no providerSub (the log line carries its hash).
  DELETE_USER_FAILED: () => "Failed to delete the Auth0 user",
  GET_USER_FAILED: () => "Failed to read the Auth0 user",
  // Client-facing: do not include providerSub or Auth0 internals.
  PASSWORD_CHANGE_TICKET_FAILED: () => "Could not start a password change. Please try again.",
};

// How long a successful management access probe is trusted. Auth0's tokens
// live a day by default; scopes removed in the dashboard should show within
// minutes, not a day.
export const MANAGEMENT_ACCESS_CACHE_MAX_SECONDS = 15 * 60;

// The probe sits in front of DELETE /users/me: a slow tenant answers 503 rather
// than holding the request.
export const MANAGEMENT_ACCESS_PROBE_TIMEOUT_MS = 5_000;

/** Management API scopes account deletion needs for every account. */
export const ACCOUNT_DELETION_SCOPES = ["delete:users"] as const;

/** And for an Apple identity, whose token is read off the Auth0 user and revoked first. */
export const APPLE_ACCOUNT_DELETION_SCOPES = ["delete:users", "read:users", "read:user_idp_tokens"] as const;
