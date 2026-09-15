import { Injectable, NotImplementedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { AUTH0_MANAGEMENT_ERRORS } from "./auth0-management.constants";

@Injectable()
export class Auth0ManagementService {
  constructor(
    configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
    // JWT auth already requires this; keep the same hard dependency here so the
    // management service fails fast if Auth0 is misconfigured
    configService.getOrThrow<string>("auth0.domain");
  }

  deleteUser(_providerSub: string): Promise<void> {
    return Promise.reject(new NotImplementedException(AUTH0_MANAGEMENT_ERRORS.DELETE_USER_NOT_IMPLEMENTED()));
  }
}
