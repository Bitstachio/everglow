import { ForbiddenException, Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { CREDENTIALS_SERVICE_ERRORS, isAuth0DatabaseProviderSub } from "./credentials.constants";
import { PasswordChangeTicketResponseDto } from "./dto/password-change-ticket-response.dto";

@Injectable()
export class CredentialsService {
  constructor(
    private readonly auth0Management: Auth0ManagementService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CredentialsService.name);
  }

  /**
   * Returns an Auth0-hosted password-change URL for the caller's database
   * identity. Social identities are rejected: they have no password in Auth0.
   */
  async createPasswordChangeTicket(
    userId: string,
    providerSub: string,
  ): Promise<PasswordChangeTicketResponseDto> {
    if (!isAuth0DatabaseProviderSub(providerSub)) {
      throw new ForbiddenException(CREDENTIALS_SERVICE_ERRORS.PASSWORD_CHANGE_NOT_AVAILABLE);
    }

    const { ticketUrl } = await this.auth0Management.createPasswordChangeTicket(providerSub);

    this.logger.info(
      { event: "user.credentials.password_change_ticket.created", userId },
      "Password-change ticket created",
    );

    return { ticketUrl };
  }
}
