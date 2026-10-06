/**
 * Auth0's signing keys couldn't be fetched, so a token couldn't be checked at
 * all: Auth0 or the network is down, or jwks-rsa's limit of key fetches a
 * minute is spent. That's our failure, not the token's, so `JwtAuthGuard`
 * answers 503 instead of a 401 that would sign the user out.
 */
export class SigningKeysUnavailableError extends Error {
  constructor(cause: Error) {
    super(`${cause.name}: ${cause.message}`, { cause });
    this.name = "SigningKeysUnavailableError";
  }
}
