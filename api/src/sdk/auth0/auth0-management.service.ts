import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ManagementClient, ManagementError } from "auth0";
import { PinoLogger } from "nestjs-pino";
import { AUTH0_MANAGEMENT_ERRORS } from "./auth0-management.constants";

/** Tokens the upstream identity provider issued to Auth0 for one of a user's identities. */
export interface IdentityProviderTokens {
  accessToken?: string;
  refreshToken?: string;
}

export type PasswordChangeTicket = {
  ticketUrl: string;
};

@Injectable()
export class Auth0ManagementService {
  private client?: ManagementClient;

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
   * The tokens Auth0 holds from `provider` for this user, or null when the
   * Auth0 user no longer exists. Auth0 only returns these fields when the
   * management client has the `read:user_idp_tokens` scope; without it the
   * result is an empty object, not an error.
   */
  async getIdentityProviderTokens(providerSub: string, provider: string): Promise<IdentityProviderTokens | null> {
    const client = this.getClient();
    try {
      const user = await client.users.get(providerSub, { fields: "identities", include_fields: true });
      const identity = user.identities?.find((candidate) => candidate.provider === provider);
      return { accessToken: identity?.access_token, refreshToken: identity?.refresh_token };
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
