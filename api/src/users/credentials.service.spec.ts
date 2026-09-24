import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DeepMockProxy, mockDeep, mockReset } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { CredentialsService } from "./credentials.service";
import { CREDENTIALS_SERVICE_ERRORS } from "./credentials.constants";

describe("CredentialsService", () => {
  let service: CredentialsService;
  let auth0Management: DeepMockProxy<Auth0ManagementService>;
  let logger: DeepMockProxy<PinoLogger>;

  beforeEach(async () => {
    auth0Management = mockDeep<Auth0ManagementService>();
    logger = mockDeep<PinoLogger>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialsService,
        { provide: Auth0ManagementService, useValue: auth0Management },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(CredentialsService);
  });

  afterEach(() => {
    mockReset(auth0Management);
    mockReset(logger);
  });

  it("creates a password-change ticket for a database identity", async () => {
    auth0Management.createPasswordChangeTicket.mockResolvedValue({
      ticketUrl: "https://auth0.example/ticket",
    });

    await expect(service.createPasswordChangeTicket("user-1", "auth0|abc")).resolves.toEqual({
      ticketUrl: "https://auth0.example/ticket",
    });
    expect(auth0Management.createPasswordChangeTicket).toHaveBeenCalledWith("auth0|abc");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.credentials.password_change_ticket.created", userId: "user-1" }),
      expect.any(String),
    );
  });

  it.each(["apple|001.abc", "google-oauth2|123", "facebook|456"])(
    "rejects non-database identities (%s)",
    async (providerSub) => {
      await expect(service.createPasswordChangeTicket("user-1", providerSub)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.createPasswordChangeTicket("user-1", providerSub)).rejects.toThrow(
        CREDENTIALS_SERVICE_ERRORS.PASSWORD_CHANGE_NOT_AVAILABLE,
      );
      expect(auth0Management.createPasswordChangeTicket).not.toHaveBeenCalled();
    },
  );
});
