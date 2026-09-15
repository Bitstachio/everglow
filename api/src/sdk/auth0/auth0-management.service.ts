import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ManagementClient, ManagementError } from "auth0";
import { PinoLogger } from "nestjs-pino";
import { AUTH0_MANAGEMENT_ERRORS } from "./auth0-management.constants";

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
   * by account deletion alone, and throwing in the constructor takes the whole
   * API down when they are absent; this way a missing secret fails the one
   * endpoint that needs it, loudly, and the saga's durable marker means the
   * deletion resumes once the credentials are in place.
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
}

const isAuth0NotFound = (error: unknown): boolean => error instanceof ManagementError && error.statusCode === 404;
