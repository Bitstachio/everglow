import { Injectable, NotImplementedException } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { AUTH0_MANAGEMENT_SERVICE_ERRORS } from "./auth0-management.constants";

/**
 * Thin wrapper around the Auth0 Management API.
 * Methods are stubs until the client integration is implemented.
 */
@Injectable()
export class Auth0ManagementService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(Auth0ManagementService.name);
  }

  /**
   * Deletes the Auth0 user identified by their `providerSub` (Auth0 `user_id`).
   */
  async deleteUser(_providerSub: string): Promise<void> {
    throw new NotImplementedException(AUTH0_MANAGEMENT_SERVICE_ERRORS.NOT_IMPLEMENTED("deleteUser"));
  }
}
