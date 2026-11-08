/**
 * Auth0's signing keys couldn't be fetched and none were ever loaded, so a
 * token couldn't be checked at all: Auth0 or the network is down. That's our
 * failure, not the token's, so `JwtAuthGuard` answers 503 instead of a 401
 * that would sign the user out. Once a key set has loaded, a failed refresh
 * keeps it and this is never raised (`SigningKeySet`).
 */
export class SigningKeysUnavailableError extends Error {
  constructor(cause: Error) {
    super(`${cause.name}: ${cause.message}`, { cause });
    this.name = "SigningKeysUnavailableError";
  }
}
