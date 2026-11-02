import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthenticationClient, ManagementClient, ManagementError } from "auth0";
import { PinoLogger } from "nestjs-pino";
import {
  AUTH0_MANAGEMENT_ERRORS,
  MANAGEMENT_ACCESS_CACHE_MAX_SECONDS,
  MANAGEMENT_ACCESS_PROBE_TIMEOUT_MS,
  PASSWORD_CHANGE_TICKET_TTL_SECONDS,
} from "./auth0-management.constants";

/** Tokens the upstream identity provider issued to Auth0 for one of a user's identities. */
export interface IdentityProviderTokens {
  accessToken?: string;
  refreshToken?: string;
}

export type PasswordChangeTicket = {
  ticketUrl: string;
};

/**
 * Whether the management client could do what a caller is about to need, and
 * if not, why. `missingScopes` names grants the tenant has not given it.
 */
export type ManagementAccess =
  | { ok: true }
  | { ok: false; reason: "credentials_missing" | "token_refused" | "probe_failed" }
  | { ok: false; reason: "scope_missing"; missingScopes: string[] };

/** The scopes a client-credentials token was granted, read from the grant or the token itself. */
export const grantedScopesOf = (grant: { access_token?: string; scope?: unknown }): Set<string> => {
  let scope = typeof grant.scope === "string" ? grant.scope : undefined;
  if (scope === undefined && grant.access_token) {
    try {
      const payload = JSON.parse(Buffer.from(grant.access_token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
        scope?: unknown;
      };
      if (typeof payload.scope === "string") scope = payload.scope;
    } catch {
      // An opaque token says nothing about its scopes; treat it as granting none.
    }
  }
  return new Set((scope ?? "").split(" ").filter(Boolean));
};

@Injectable()
export class Auth0ManagementService {
  private client?: ManagementClient;
  // Scopes of the last token the probe obtained, until it would have expired.
  private grantedScopes?: { scopes: Set<string>; until: number };

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Built on first use rather than at boot. Management credentials are needed
   * by account deletion and password-change tickets; throwing in the constructor
   * would take the whole API down when they are absent. Missing secrets fail the
   * endpoints that need them instead.
   */
  private getClient(): ManagementClient {
    if (this.client) return this.client;

    const domain = this.configService.getOrThrow<string>("auth0.domain");
    const clientId = this.configService.get<string>("auth0.managementClientId");
    const clientSecret = this.configService.get<string>("auth0.managementClientSecret");
    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(AUTH0_MANAGEMENT_ERRORS.CREDENTIALS_NOT_CONFIGURED());
    }

    this.client = new ManagementClient({ domain, clientId, clientSecret });
    return this.client;
  }

  /**
   * Checks, before anything is changed, that the management client can do
   * what account deletion will ask of it: the credentials are configured, the
   * tenant hands out a Management API token for them, and that token carries
   * every scope in `requiredScopes`. Account deletion runs this first so a
   * missing secret or grant answers 503 with nothing touched, instead of
   * failing halfway through the saga (docs/account-deletion.md §7).
   *
   * One client-credentials grant, cached for as long as the token would live
   * (at most MANAGEMENT_ACCESS_CACHE_MAX_SECONDS). A failed probe is not
   * cached, so fixing the tenant takes effect on the next request. Never throws.
   */
  async checkAccess(requiredScopes: readonly string[]): Promise<ManagementAccess> {
    const clientId = this.configService.get<string>("auth0.managementClientId");
    const clientSecret = this.configService.get<string>("auth0.managementClientSecret");
    if (!clientId || !clientSecret) return { ok: false, reason: "credentials_missing" };

    const now = Date.now();
    let scopes = this.grantedScopes && this.grantedScopes.until > now ? this.grantedScopes.scopes : undefined;
    if (!scopes || requiredScopes.some((scope) => !scopes!.has(scope))) {
      const domain = this.configService.getOrThrow<string>("auth0.domain");
      try {
        const auth = new AuthenticationClient({ domain, clientId, clientSecret });
        const { data } = await auth.oauth.clientCredentialsGrant(
          { audience: `https://${domain}/api/v2/` },
          { initOverrides: { signal: AbortSignal.timeout(MANAGEMENT_ACCESS_PROBE_TIMEOUT_MS) } },
        );
        scopes = grantedScopesOf(data);
        const lifetimeSeconds = Math.min(data.expires_in ?? 0, MANAGEMENT_ACCESS_CACHE_MAX_SECONDS);
        this.grantedScopes = { scopes, until: now + lifetimeSeconds * 1000 };
      } catch (error) {
        this.grantedScopes = undefined;
        const status = (error as { statusCode?: unknown }).statusCode;
        const refused = typeof status === "number" && status >= 400 && status < 500;
        this.logger.error(
          { err: error as Error, statusCode: status },
          refused ? "auth0 refused the management token" : "auth0 management token probe failed",
        );
        return { ok: false, reason: refused ? "token_refused" : "probe_failed" };
      }
    }

    const granted = scopes;
    const missingScopes = requiredScopes.filter((scope) => !granted.has(scope));
    return missingScopes.length > 0 ? { ok: false, reason: "scope_missing", missingScopes } : { ok: true };
  }

  /**
   * The tokens Auth0 holds from `provider` for this user, one entry per
   * identity of that provider (more than one only if accounts are ever
   * linked), or null when the Auth0 user no longer exists. Auth0 only returns
   * the token fields when the management client has the `read:user_idp_tokens`
   * scope; without it each entry is empty, not an error.
   */
  async getIdentityProviderTokens(providerSub: string, provider: string): Promise<IdentityProviderTokens[] | null> {
    const client = this.getClient();
    try {
      const user = await client.users.get(providerSub, { fields: "identities", include_fields: true });
      return (user.identities ?? [])
        .filter((candidate) => candidate.provider === provider)
        .map((identity) => ({ accessToken: identity.access_token, refreshToken: identity.refresh_token }));
    } catch (error) {
      if (isAuth0NotFound(error)) return null;

      this.logger.error({ err: error as Error, providerSub, provider }, "auth0 getUser failed");
      throw new InternalServerErrorException(AUTH0_MANAGEMENT_ERRORS.GET_USER_FAILED(providerSub));
    }
  }

  async deleteUser(providerSub: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.users.delete(providerSub);
    } catch (error) {
      if (isAuth0NotFound(error)) return;

      this.logger.error({ err: error as Error, providerSub }, "auth0 deleteUser failed");
      throw new InternalServerErrorException(AUTH0_MANAGEMENT_ERRORS.DELETE_USER_FAILED(providerSub));
    }
  }

  /**
   * Mints a one-time Auth0 password-change ticket URL for a database identity.
   * The caller must have already verified the person (bearer JWT) and that the
   * subject is an `auth0|…` database user. The password is typed on Auth0's
   * page; it never reaches this API.
   *
   * New Universal Login rejects `result_url` when `client_id` is set. We pass
   * only `client_id` so Auth0 brands the page and can offer "Back to app" via
   * the application's Application Login URI. Do not add `result_url` here.
   */
  async createPasswordChangeTicket(providerSub: string): Promise<PasswordChangeTicket> {
    const nativeClientId = this.configService.get<string>("auth0.nativeClientId");
    if (!nativeClientId) {
      throw new InternalServerErrorException(AUTH0_MANAGEMENT_ERRORS.PASSWORD_CHANGE_TICKET_NOT_CONFIGURED());
    }

    const client = this.getClient();
    try {
      const response = await client.tickets.changePassword({
        user_id: providerSub,
        client_id: nativeClientId,
        mark_email_as_verified: false,
        // Auth0's default is five days: long enough to turn a stolen access token into a takeover.
        ttl_sec: PASSWORD_CHANGE_TICKET_TTL_SECONDS,
      });

      if (!response.ticket) {
        throw new InternalServerErrorException(AUTH0_MANAGEMENT_ERRORS.PASSWORD_CHANGE_TICKET_FAILED());
      }

      return { ticketUrl: response.ticket };
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;

      this.logger.error({ err: error as Error, providerSub }, "auth0 createPasswordChangeTicket failed");
      throw new InternalServerErrorException(AUTH0_MANAGEMENT_ERRORS.PASSWORD_CHANGE_TICKET_FAILED());
    }
  }
}

const isAuth0NotFound = (error: unknown): boolean => error instanceof ManagementError && error.statusCode === 404;
