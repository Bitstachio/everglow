export const APPLE_SIWA_ISSUER = "https://appleid.apple.com";
export const APPLE_SIWA_REVOKE_URL = `${APPLE_SIWA_ISSUER}/auth/revoke`;

// Apple accepts a client secret valid for up to six months; ours is minted per
// request, so a few minutes covers clock skew and nothing more.
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 300;
export const APPLE_CLIENT_SECRET_MAX_TTL_SECONDS = 15_777_000;

export const APPLE_SIWA_REQUEST_TIMEOUT_MS = 10_000;

export const APPLE_SIWA_ERRORS = {
  CREDENTIALS_NOT_CONFIGURED: () => "Sign in with Apple revocation credentials are not configured",
  CLIENT_SECRET_TTL_TOO_LONG: (ttl: number) =>
    `Apple client secret TTL of ${ttl}s exceeds Apple's maximum of ${APPLE_CLIENT_SECRET_MAX_TTL_SECONDS}s`,
  REVOKE_REJECTED: (code: string) => `Apple rejected the token revocation request (${code})`,
  REVOKE_UNAVAILABLE: (status: number) => `Apple token revocation endpoint responded with HTTP ${status}`,
  REVOKE_TRANSPORT_FAILED: () => "Apple token revocation request failed before a response was received",
};
