import { Test } from "@nestjs/testing";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AppleSiwaService } from "src/sdk/apple/apple-siwa.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { AccountDeletionPreflightService } from "./account-deletion-preflight.service";

describe("AccountDeletionPreflightService", () => {
  let service: AccountDeletionPreflightService;
  let auth0Management: DeepMockProxy<Auth0ManagementService>;
  let appleSiwa: DeepMockProxy<AppleSiwaService>;
  let logger: { setContext: jest.Mock; error: jest.Mock };

  const user = { id: "11111111-1111-1111-1111-111111111111", providerSub: "auth0|abc", auth0DeletedAt: null };
  const appleUser = { ...user, providerSub: "apple|001.abc" };

  beforeEach(async () => {
    auth0Management = mockDeep<Auth0ManagementService>();
    appleSiwa = mockDeep<AppleSiwaService>();
    auth0Management.checkAccess.mockResolvedValue({ ok: true });
    appleSiwa.revocationProblem.mockReturnValue(null);
    logger = { setContext: jest.fn(), error: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AccountDeletionPreflightService,
        { provide: Auth0ManagementService, useValue: auth0Management },
        { provide: AppleSiwaService, useValue: appleSiwa },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    service = module.get(AccountDeletionPreflightService);
  });

  it("passes when the management client can delete users", async () => {
    await expect(service.assertCanFinish(user)).resolves.toBeUndefined();

    expect(auth0Management.checkAccess).toHaveBeenCalledWith(["delete:users"]);
    expect(appleSiwa.revocationProblem).not.toHaveBeenCalled();
  });

  it("needs the token-reading scopes and a usable Apple key for an Apple identity", async () => {
    await service.assertCanFinish(appleUser);

    expect(auth0Management.checkAccess).toHaveBeenCalledWith(["delete:users", "read:users", "read:user_idp_tokens"]);
    expect(appleSiwa.revocationProblem).toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, reason: "credentials_missing" } as const, "auth0_credentials_missing"],
    [{ ok: false, reason: "token_refused" } as const, "auth0_token_refused"],
    [{ ok: false, reason: "probe_failed" } as const, "auth0_probe_failed"],
  ])("refuses with 503 ACCOUNT_DELETION_UNAVAILABLE when Auth0 access is %o", async (access, blocker) => {
    auth0Management.checkAccess.mockResolvedValue(access);

    await expect(service.assertCanFinish(user)).rejects.toMatchObject({
      code: "ACCOUNT_DELETION_UNAVAILABLE",
      status: 503,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_unavailable", userId: user.id, blockers: [blocker] }),
      expect.any(String),
    );
  });

  it("names the missing scopes", async () => {
    auth0Management.checkAccess.mockResolvedValue({
      ok: false,
      reason: "scope_missing",
      missingScopes: ["read:users"],
    });

    await expect(service.assertCanFinish(appleUser)).rejects.toMatchObject({ code: "ACCOUNT_DELETION_UNAVAILABLE" });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ blockers: ["auth0_scope_missing"], missingScopes: ["read:users"] }),
      expect.any(String),
    );
  });

  it.each(["unconfigured", "key_unusable"] as const)(
    "refuses an Apple identity when Sign in with Apple is %s",
    async (problem) => {
      appleSiwa.revocationProblem.mockReturnValue(problem);

      await expect(service.assertCanFinish(appleUser)).rejects.toMatchObject({ code: "ACCOUNT_DELETION_UNAVAILABLE" });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ blockers: [`apple_${problem}`], apple: true }),
        expect.any(String),
      );
    },
  );

  it("ignores Apple for any other identity", async () => {
    appleSiwa.revocationProblem.mockReturnValue("unconfigured");

    await expect(service.assertCanFinish(user)).resolves.toBeUndefined();
  });

  it("checks nothing once Auth0 is cleared: only database work is left", async () => {
    auth0Management.checkAccess.mockResolvedValue({ ok: false, reason: "credentials_missing" });

    await expect(service.assertCanFinish({ ...appleUser, auth0DeletedAt: new Date() })).resolves.toBeUndefined();
    expect(auth0Management.checkAccess).not.toHaveBeenCalled();
  });
});
