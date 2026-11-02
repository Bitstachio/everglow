export const AUTH0_MANAGEMENT_ERRORS = {
  CREDENTIALS_NOT_CONFIGURED: () => "Auth0 Management API credentials are not configured",
  PASSWORD_CHANGE_TICKET_NOT_CONFIGURED: () =>
    "Auth0 password-change ticket settings are not configured (native client id)",
  DELETE_USER_FAILED: (providerSub: string) => `Failed to delete Auth0 user "${providerSub}"`,
  GET_USER_FAILED: (providerSub: string) => `Failed to read Auth0 user "${providerSub}"`,
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
