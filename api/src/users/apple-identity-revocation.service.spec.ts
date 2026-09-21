import { InternalServerErrorException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AppleSiwaService, AppleTokenRevocationError } from "src/sdk/apple/apple-siwa.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { AppleIdentityRevocationService } from "./apple-identity-revocation.service";

describe("AppleIdentityRevocationService", () => {
  let service: AppleIdentityRevocationService;
  let auth0Management: DeepMockProxy<Auth0ManagementService>;
  let appleSiwa: DeepMockProxy<AppleSiwaService>;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const appleSub = "apple|001234.abcdef0123456789.0987";

  beforeEach(async () => {
    auth0Management = mockDeep<Auth0ManagementService>();
    appleSiwa = mockDeep<AppleSiwaService>();
    appleSiwa.isRevocationConfigured.mockReturnValue(true);
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleIdentityRevocationService,
        { provide: Auth0ManagementService, useValue: auth0Management },
        { provide: AppleSiwaService, useValue: appleSiwa },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(AppleIdentityRevocationService);
  });

  it("does nothing for a non-Apple identity", async () => {
    await expect(service.revokeBeforeAuth0Delete(userId, "auth0|abc123")).resolves.toBe("not_apple");
    await expect(service.revokeBeforeAuth0Delete(userId, "google-oauth2|123")).resolves.toBe("not_apple");

    expect(auth0Management.getIdentityProviderTokens).not.toHaveBeenCalled();
    expect(appleSiwa.revokeToken).not.toHaveBeenCalled();
  });

  it("revokes the refresh token Auth0 holds for the Apple identity", async () => {
    auth0Management.getIdentityProviderTokens.mockResolvedValue({ refreshToken: "r-1", accessToken: "a-1" });
    appleSiwa.revokeToken.mockResolvedValue(undefined);

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).resolves.toBe("revoked");

    expect(auth0Management.getIdentityProviderTokens).toHaveBeenCalledWith(appleSub, "apple");
    expect(appleSiwa.revokeToken).toHaveBeenCalledWith("r-1", "refresh_token");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.apple_token_revoked", userId, tokenType: "refresh_token" }),
      expect.any(String),
    );
  });

  it("falls back to the access token when Auth0 stored no refresh token", async () => {
    auth0Management.getIdentityProviderTokens.mockResolvedValue({ accessToken: "a-1" });
    appleSiwa.revokeToken.mockResolvedValue(undefined);

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).resolves.toBe("revoked");

    expect(appleSiwa.revokeToken).toHaveBeenCalledWith("a-1", "access_token");
  });

  it("never logs the token values", async () => {
    auth0Management.getIdentityProviderTokens.mockResolvedValue({ refreshToken: "r-secret", accessToken: "a-secret" });
    appleSiwa.revokeToken.mockResolvedValue(undefined);

    await service.revokeBeforeAuth0Delete(userId, appleSub);

    const calls: unknown[] = [logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls];
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain("r-secret");
    expect(logged).not.toContain("a-secret");
  });

  it("skips with an error log when Apple credentials are not configured", async () => {
    appleSiwa.isRevocationConfigured.mockReturnValue(false);

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).resolves.toBe("skipped_unconfigured");

    expect(auth0Management.getIdentityProviderTokens).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.apple_revocation_skipped", reason: "unconfigured", userId }),
      expect.any(String),
    );
  });

  it("skips quietly when the Auth0 user is already gone (resumed saga)", async () => {
    auth0Management.getIdentityProviderTokens.mockResolvedValue(null);

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).resolves.toBe("skipped_identity_gone");

    expect(appleSiwa.revokeToken).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.apple_revocation_skipped", reason: "identity_gone" }),
      expect.any(String),
    );
  });

  it("skips with an error log when Auth0 returned no token for the identity", async () => {
    auth0Management.getIdentityProviderTokens.mockResolvedValue({});

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).resolves.toBe("skipped_no_token");

    expect(appleSiwa.revokeToken).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.apple_revocation_skipped", reason: "no_token" }),
      expect.any(String),
    );
  });

  it("logs and continues when Apple rejects the request for good", async () => {
    auth0Management.getIdentityProviderTokens.mockResolvedValue({ refreshToken: "r-1" });
    appleSiwa.revokeToken.mockRejectedValue(new AppleTokenRevocationError("invalid_client", false));

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).resolves.toBe("failed");

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.apple_revocation_failed", userId, retryable: false }),
      expect.any(String),
    );
  });

  it("propagates a retryable Apple failure so the saga retries while the token still exists", async () => {
    auth0Management.getIdentityProviderTokens.mockResolvedValue({ refreshToken: "r-1" });
    const outage = new AppleTokenRevocationError("503", true);
    appleSiwa.revokeToken.mockRejectedValue(outage);

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).rejects.toBe(outage);
  });

  it("propagates an Auth0 read failure", async () => {
    const auth0Error = new InternalServerErrorException("auth0 down");
    auth0Management.getIdentityProviderTokens.mockRejectedValue(auth0Error);

    await expect(service.revokeBeforeAuth0Delete(userId, appleSub)).rejects.toBe(auth0Error);
    expect(appleSiwa.revokeToken).not.toHaveBeenCalled();
  });
});
