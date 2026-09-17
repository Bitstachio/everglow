import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { AppleSiwaService, AppleTokenRevocationError, AppleTokenTypeHint } from "src/sdk/apple/apple-siwa.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { APPLE_PROVIDER, isAppleProviderSub } from "./users.constants";

export type AppleRevocationOutcome =
  | "not_apple"
  | "revoked"
  | "skipped_unconfigured"
  | "skipped_identity_gone"
  | "skipped_no_token"
  | "failed";

/**
 * Apple's account-deletion rule for Sign in with Apple: when the account goes,
 * the app must revoke the Apple tokens it holds, or the person stays
 * "authorised" in their Apple ID settings and a later sign-in skips Apple's
 * consent screen and never re-sends their email. Auth0 obtained those tokens
 * and keeps them on the user's identity, and deleting the Auth0 user throws
 * them away without revoking anything, so this runs first.
 *
 * Deletion is never blocked for good by this step. A retryable failure
 * (Apple unreachable) propagates so the saga retries while the token is still
 * there; anything else is logged for ops and the deletion carries on, which is
 * what Apple asks for when a token cannot be revoked.
 */
@Injectable()
export class AppleIdentityRevocationService {
  constructor(
    private readonly auth0Management: Auth0ManagementService,
    private readonly appleSiwa: AppleSiwaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** Must run while the Auth0 user still exists: the token lives on it. */
  async revokeBeforeAuth0Delete(userId: string, providerSub: string): Promise<AppleRevocationOutcome> {
    if (!isAppleProviderSub(providerSub)) return "not_apple";

    if (!this.appleSiwa.isRevocationConfigured()) {
      this.logger.error(
        { event: "user.account.apple_revocation_skipped", userId, reason: "unconfigured", audit: true },
        "Apple user deleted without revoking their Sign in with Apple token: APPLE_SIWA_* is not configured",
      );
      return "skipped_unconfigured";
    }

    const tokens = await this.auth0Management.getIdentityProviderTokens(providerSub, APPLE_PROVIDER);
    if (tokens === null) {
      // Auth0 already deleted the user (a resumed saga). The token went with it;
      // nothing is left to revoke on our side.
      this.logger.warn(
        { event: "user.account.apple_revocation_skipped", userId, reason: "identity_gone", audit: true },
        "Auth0 user already gone before Apple token revocation; nothing left to revoke",
      );
      return "skipped_identity_gone";
    }

    const selected = selectToken(tokens);
    if (!selected) {
      this.logger.error(
        { event: "user.account.apple_revocation_skipped", userId, reason: "no_token", audit: true },
        "Auth0 returned no Apple token for this user: check the management client has read:user_idp_tokens " +
          "and the Apple connection stores tokens",
      );
      return "skipped_no_token";
    }

    try {
      await this.appleSiwa.revokeToken(selected.token, selected.tokenType);
    } catch (error) {
      if (error instanceof AppleTokenRevocationError && !error.retryable) {
        this.logger.error(
          { err: error, event: "user.account.apple_revocation_failed", userId, retryable: false, audit: true },
          "Apple refused the token revocation; continuing account deletion, the person must revoke manually",
        );
        return "failed";
      }
      throw error;
    }

    this.logger.info(
      { event: "user.account.apple_token_revoked", userId, tokenType: selected.tokenType, audit: true },
      "Sign in with Apple token revoked for account deletion saga",
    );
    return "revoked";
  }
}

/**
 * The refresh token is what unlinks the app from the Apple ID; revoking only
 * the access token leaves the authorisation in place. Fall back to it anyway
 * rather than do nothing, and say which one was used so a missing refresh
 * token shows up in the logs.
 */
const selectToken = (tokens: {
  accessToken?: string;
  refreshToken?: string;
}): { token: string; tokenType: AppleTokenTypeHint } | null => {
  if (tokens.refreshToken) return { token: tokens.refreshToken, tokenType: "refresh_token" };
  if (tokens.accessToken) return { token: tokens.accessToken, tokenType: "access_token" };
  return null;
};
