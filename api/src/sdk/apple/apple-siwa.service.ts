import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { signAppleClientSecret } from "./apple-client-secret";
import { APPLE_SIWA_ERRORS, APPLE_SIWA_REQUEST_TIMEOUT_MS, APPLE_SIWA_REVOKE_URL } from "./apple-siwa.constants";

export type AppleTokenTypeHint = "refresh_token" | "access_token";

/**
 * A revocation that did not go through. `retryable` separates an outage
 * (try again later, the token is still there to revoke) from a request Apple
 * will keep rejecting (wrong client id, bad key), where retrying only delays
 * the account deletion the person asked for.
 */
export class AppleTokenRevocationError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppleTokenRevocationError";
  }
}

interface AppleSiwaCredentials {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
}

/**
 * Thin client for Apple's Sign in with Apple REST API. Only revocation is
 * needed: Auth0 handles the login, but Apple keeps the app authorised for the
 * user until the token Auth0 obtained is revoked, and Auth0 does not do that
 * when the user is deleted (see docs/authentication.md, "Sign in with Apple").
 */
@Injectable()
export class AppleSiwaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  isRevocationConfigured(): boolean {
    return this.getCredentials() !== null;
  }

  /**
   * Revokes one Apple token. Apple answers 200 for a token that is already
   * revoked or was never valid, so this is idempotent and safe for a resumed
   * deletion saga to repeat.
   */
  async revokeToken(token: string, tokenTypeHint: AppleTokenTypeHint): Promise<void> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new AppleTokenRevocationError(APPLE_SIWA_ERRORS.CREDENTIALS_NOT_CONFIGURED(), false);
    }

    const body = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: signAppleClientSecret(credentials),
      token,
      token_type_hint: tokenTypeHint,
    });

    let response: Response;
    try {
      response = await fetch(APPLE_SIWA_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(APPLE_SIWA_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppleTokenRevocationError(APPLE_SIWA_ERRORS.REVOKE_TRANSPORT_FAILED(), true, error);
    }

    if (response.ok) return;

    // 400 is the only error Apple documents: a malformed request or wrong
    // client credentials, which no retry fixes. Anything else is treated as
    // an outage.
    if (response.status === 400) {
      throw new AppleTokenRevocationError(APPLE_SIWA_ERRORS.REVOKE_REJECTED(await readErrorCode(response)), false);
    }
    throw new AppleTokenRevocationError(APPLE_SIWA_ERRORS.REVOKE_UNAVAILABLE(response.status), true);
  }

  private getCredentials(): AppleSiwaCredentials | null {
    const teamId = this.configService.get<string>("apple.siwaTeamId");
    const keyId = this.configService.get<string>("apple.siwaKeyId");
    const clientId = this.configService.get<string>("apple.siwaClientId");
    const privateKey = this.configService.get<string>("apple.siwaPrivateKey");
    if (!teamId || !keyId || !clientId || !privateKey) return null;

    return { teamId, keyId, clientId, privateKey };
  }
}

const readErrorCode = async (response: Response): Promise<string> => {
  try {
    const parsed = (await response.json()) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : "unknown_error";
  } catch {
    return "unknown_error";
  }
};
