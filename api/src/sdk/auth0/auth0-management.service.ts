import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ManagementClient, ManagementError } from "auth0";
import { PinoLogger } from "nestjs-pino";
import { AUTH0_MANAGEMENT_ERRORS } from "./auth0-management.constants";

@Injectable()
export class Auth0ManagementService {
  private readonly client: ManagementClient;

  constructor(
    configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);

    const domain = configService.getOrThrow<string>("auth0.domain");
    const clientId = configService.get<string>("auth0.managementClientId");
    const clientSecret = configService.get<string>("auth0.managementClientSecret");
    if (!clientId || !clientSecret) {
      throw new Error(AUTH0_MANAGEMENT_ERRORS.CREDENTIALS_NOT_CONFIGURED());
    }

    this.client = new ManagementClient({ domain, clientId, clientSecret });
  }

  async deleteUser(providerSub: string): Promise<void> {
    try {
      await this.client.users.delete(providerSub);
    } catch (error) {
      if (isAuth0NotFound(error)) return;

      this.logger.error({ err: error as Error, providerSub }, "auth0 deleteUser failed");
      throw new InternalServerErrorException(AUTH0_MANAGEMENT_ERRORS.DELETE_USER_FAILED(providerSub));
    }
  }
}

const isAuth0NotFound = (error: unknown): boolean => error instanceof ManagementError && error.statusCode === 404;
