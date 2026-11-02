import { InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { ManagementClient, ManagementError } from "auth0";
import { PinoLogger } from "nestjs-pino";
import { AUTH0_MANAGEMENT_ERRORS } from "./auth0-management.constants";
import { Auth0ManagementService, grantedScopesOf } from "./auth0-management.service";

const mockDeleteUser = jest.fn();
const mockGetUser = jest.fn();
const mockChangePassword = jest.fn();
const mockClientCredentialsGrant = jest.fn();

jest.mock("auth0", () => {
  class MockManagementError extends Error {
    statusCode?: number;
    constructor(opts: { message?: string; statusCode?: number }) {
      super(opts.message);
      this.name = "ManagementError";
      this.statusCode = opts.statusCode;
    }
  }
  return {
    ManagementClient: jest.fn().mockImplementation(() => ({
      users: { delete: mockDeleteUser, get: mockGetUser },
      tickets: { changePassword: mockChangePassword },
    })),
    ManagementError: MockManagementError,
    AuthenticationClient: jest.fn().mockImplementation(() => ({
      oauth: { clientCredentialsGrant: mockClientCredentialsGrant },
    })),
  };
});

describe("Auth0ManagementService", () => {
  let service: Auth0ManagementService;

  const buildService = async (credentials: Record<string, string | undefined>): Promise<Auth0ManagementService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Auth0ManagementService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === "auth0.domain") return "test.example.auth0.com";
              throw new Error(`Unexpected getOrThrow key: ${key}`);
            }),
            get: jest.fn((key: string) => credentials[key]),
          },
        },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();

    return module.get(Auth0ManagementService);
  };

  beforeEach(async () => {
    mockDeleteUser.mockReset();
    mockGetUser.mockReset();
    mockChangePassword.mockReset();
    mockClientCredentialsGrant.mockReset();
    jest.mocked(ManagementClient).mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Auth0ManagementService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === "auth0.domain") return "test.example.auth0.com";
              throw new Error(`Unexpected getOrThrow key: ${key}`);
            }),
            get: jest.fn((key: string) => {
              if (key === "auth0.managementClientId") return "mgmt-client-id";
              if (key === "auth0.managementClientSecret") return "mgmt-client-secret";
              if (key === "auth0.nativeClientId") return "native-client-id";
              return undefined;
            }),
          },
        },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(Auth0ManagementService);
  });

  it("deletes the Auth0 user by providerSub", async () => {
    mockDeleteUser.mockResolvedValue(undefined);

    await expect(service.deleteUser("auth0|abc123")).resolves.toBeUndefined();
    expect(mockDeleteUser).toHaveBeenCalledWith("auth0|abc123");
  });

  it("treats Auth0 404 as success for idempotent retries", async () => {
    mockDeleteUser.mockRejectedValue(new ManagementError({ message: "not found", statusCode: 404 }));

    await expect(service.deleteUser("auth0|abc123")).resolves.toBeUndefined();
  });

  it("maps unexpected Auth0 errors to InternalServerErrorException", async () => {
    mockDeleteUser.mockRejectedValue(new ManagementError({ message: "boom", statusCode: 500 }));

    await expect(service.deleteUser("auth0|abc123")).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  describe("checkAccess", () => {
    const grant = (scope: string, expiresIn = 86400) => ({
      data: { access_token: "opaque", token_type: "Bearer", expires_in: expiresIn, scope },
    });

    it("passes when the management token carries every scope asked for", async () => {
      mockClientCredentialsGrant.mockResolvedValue(grant("read:users delete:users read:user_idp_tokens"));

      await expect(service.checkAccess(["delete:users", "read:user_idp_tokens"])).resolves.toEqual({ ok: true });
      expect(mockClientCredentialsGrant).toHaveBeenCalledWith(
        { audience: "https://test.example.auth0.com/api/v2/" },
        expect.anything(),
      );
    });

    it("names the scopes the tenant has not granted", async () => {
      mockClientCredentialsGrant.mockResolvedValue(grant("delete:users"));

      await expect(service.checkAccess(["delete:users", "read:users", "read:user_idp_tokens"])).resolves.toEqual({
        ok: false,
        reason: "scope_missing",
        missingScopes: ["read:users", "read:user_idp_tokens"],
      });
    });

    it("reuses a successful probe instead of asking Auth0 again", async () => {
      mockClientCredentialsGrant.mockResolvedValue(grant("delete:users read:users read:user_idp_tokens"));

      await service.checkAccess(["delete:users"]);
      await service.checkAccess(["delete:users", "read:users"]);

      expect(mockClientCredentialsGrant).toHaveBeenCalledTimes(1);
    });

    it("asks again when the cached grant lacks a scope, so a fixed tenant takes effect", async () => {
      mockClientCredentialsGrant
        .mockResolvedValueOnce(grant("delete:users"))
        .mockResolvedValueOnce(grant("delete:users read:users"));

      await expect(service.checkAccess(["read:users"])).resolves.toMatchObject({ ok: false });
      await expect(service.checkAccess(["read:users"])).resolves.toEqual({ ok: true });
    });

    it("reports a token Auth0 refuses (a bad secret) without throwing", async () => {
      mockClientCredentialsGrant.mockRejectedValue(Object.assign(new Error("access_denied"), { statusCode: 401 }));

      await expect(service.checkAccess(["delete:users"])).resolves.toEqual({ ok: false, reason: "token_refused" });
    });

    it("reports Auth0 being unreachable without throwing", async () => {
      mockClientCredentialsGrant.mockRejectedValue(new Error("fetch failed"));

      await expect(service.checkAccess(["delete:users"])).resolves.toEqual({ ok: false, reason: "probe_failed" });
    });

    it("reports missing credentials without calling Auth0", async () => {
      const unconfigured = await buildService({});

      await expect(unconfigured.checkAccess(["delete:users"])).resolves.toEqual({
        ok: false,
        reason: "credentials_missing",
      });
      expect(mockClientCredentialsGrant).not.toHaveBeenCalled();
    });
  });

  describe("grantedScopesOf", () => {
    it("reads the grant's scope string", () => {
      expect(grantedScopesOf({ scope: "a b  c" })).toEqual(new Set(["a", "b", "c"]));
    });

    it("falls back to the scope claim of a JWT access token", () => {
      const payload = Buffer.from(JSON.stringify({ scope: "delete:users read:users" })).toString("base64url");
      expect(grantedScopesOf({ access_token: `h.${payload}.s` })).toEqual(new Set(["delete:users", "read:users"]));
    });

    it("grants nothing for an opaque token with no scope", () => {
      expect(grantedScopesOf({ access_token: "opaque" })).toEqual(new Set());
    });
  });

  describe("getIdentityProviderTokens", () => {
    it("returns the tokens of the identity from the requested provider", async () => {
      mockGetUser.mockResolvedValue({
        identities: [
          { provider: "auth0", connection: "Username-Password-Authentication", user_id: "abc" },
          { provider: "apple", connection: "apple", user_id: "001.abc", access_token: "a-1", refresh_token: "r-1" },
        ],
      });

      await expect(service.getIdentityProviderTokens("apple|001.abc", "apple")).resolves.toEqual([
        { accessToken: "a-1", refreshToken: "r-1" },
      ]);
      expect(mockGetUser).toHaveBeenCalledWith("apple|001.abc", { fields: "identities", include_fields: true });
    });

    it("returns empty tokens when the identity has none exposed (missing read:user_idp_tokens)", async () => {
      mockGetUser.mockResolvedValue({ identities: [{ provider: "apple", connection: "apple", user_id: "001.abc" }] });

      await expect(service.getIdentityProviderTokens("apple|001.abc", "apple")).resolves.toEqual([
        { accessToken: undefined, refreshToken: undefined },
      ]);
    });

    it("returns every identity of the provider when accounts are linked", async () => {
      mockGetUser.mockResolvedValue({
        identities: [
          { provider: "apple", connection: "apple", user_id: "001.abc", refresh_token: "r-1" },
          { provider: "apple", connection: "apple", user_id: "002.def", refresh_token: "r-2" },
        ],
      });

      await expect(service.getIdentityProviderTokens("apple|001.abc", "apple")).resolves.toEqual([
        { accessToken: undefined, refreshToken: "r-1" },
        { accessToken: undefined, refreshToken: "r-2" },
      ]);
    });

    it("returns no entries when no identity matches the provider", async () => {
      mockGetUser.mockResolvedValue({ identities: [{ provider: "auth0", connection: "db", user_id: "abc" }] });

      await expect(service.getIdentityProviderTokens("auth0|abc", "apple")).resolves.toEqual([]);
    });

    it("returns null when the Auth0 user no longer exists", async () => {
      mockGetUser.mockRejectedValue(new ManagementError({ message: "not found", statusCode: 404 }));

      await expect(service.getIdentityProviderTokens("apple|001.abc", "apple")).resolves.toBeNull();
    });

    it("maps unexpected Auth0 errors to InternalServerErrorException", async () => {
      mockGetUser.mockRejectedValue(new ManagementError({ message: "boom", statusCode: 500 }));

      await expect(service.getIdentityProviderTokens("apple|001.abc", "apple")).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe("credentials", () => {
    // Account deletion and password-change tickets share the management client;
    // a missing secret must fail those endpoints rather than stop the API from starting.
    it("constructs without management credentials and does not build a client", async () => {
      jest.mocked(ManagementClient).mockClear();

      await expect(buildService({})).resolves.toBeInstanceOf(Auth0ManagementService);

      expect(ManagementClient).not.toHaveBeenCalled();
    });

    it("fails the delete with a server error when credentials are missing", async () => {
      const unconfigured = await buildService({ "auth0.managementClientId": "id-only" });

      await expect(unconfigured.deleteUser("auth0|abc123")).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(unconfigured.deleteUser("auth0|abc123")).rejects.toThrow(
        AUTH0_MANAGEMENT_ERRORS.CREDENTIALS_NOT_CONFIGURED(),
      );
    });

    it("builds the client once and reuses it across calls", async () => {
      jest.mocked(ManagementClient).mockClear();

      await service.deleteUser("auth0|abc123");
      await service.deleteUser("auth0|def456");

      expect(ManagementClient).toHaveBeenCalledTimes(1);
    });
  });

  describe("createPasswordChangeTicket", () => {
    it("requests a five-minute ticket with the native client id", async () => {
      mockChangePassword.mockResolvedValue({ ticket: "https://auth0.example/ticket" });

      await expect(service.createPasswordChangeTicket("auth0|abc123")).resolves.toEqual({
        ticketUrl: "https://auth0.example/ticket",
      });
      expect(mockChangePassword).toHaveBeenCalledWith({
        user_id: "auth0|abc123",
        client_id: "native-client-id",
        mark_email_as_verified: false,
        ttl_sec: 300,
      });
    });

    it("fails when the native client id is missing", async () => {
      const unconfigured = await buildService({
        "auth0.managementClientId": "mgmt-client-id",
        "auth0.managementClientSecret": "mgmt-client-secret",
      });

      await expect(unconfigured.createPasswordChangeTicket("auth0|abc123")).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      await expect(unconfigured.createPasswordChangeTicket("auth0|abc123")).rejects.toThrow(
        AUTH0_MANAGEMENT_ERRORS.PASSWORD_CHANGE_TICKET_NOT_CONFIGURED(),
      );
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it("fails when Auth0 returns no ticket URL", async () => {
      mockChangePassword.mockResolvedValue({});

      await expect(service.createPasswordChangeTicket("auth0|abc123")).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it("maps Auth0 errors to a client-safe InternalServerErrorException", async () => {
      mockChangePassword.mockRejectedValue(new ManagementError({ message: "boom", statusCode: 500 }));

      await expect(service.createPasswordChangeTicket("auth0|abc123")).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      await expect(service.createPasswordChangeTicket("auth0|abc123")).rejects.toThrow(
        AUTH0_MANAGEMENT_ERRORS.PASSWORD_CHANGE_TICKET_FAILED(),
      );
    });
  });
});
