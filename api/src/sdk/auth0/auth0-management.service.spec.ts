import { InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { ManagementClient, ManagementError } from "auth0";
import { PinoLogger } from "nestjs-pino";
import { AUTH0_MANAGEMENT_ERRORS } from "./auth0-management.constants";
import { Auth0ManagementService } from "./auth0-management.service";

const mockDeleteUser = jest.fn();
const mockGetUser = jest.fn();

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
    })),
    ManagementError: MockManagementError,
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

  describe("getIdentityProviderTokens", () => {
    it("returns the tokens of the identity from the requested provider", async () => {
      mockGetUser.mockResolvedValue({
        identities: [
          { provider: "auth0", connection: "Username-Password-Authentication", user_id: "abc" },
          { provider: "apple", connection: "apple", user_id: "001.abc", access_token: "a-1", refresh_token: "r-1" },
        ],
      });

      await expect(service.getIdentityProviderTokens("apple|001.abc", "apple")).resolves.toEqual({
        accessToken: "a-1",
        refreshToken: "r-1",
      });
      expect(mockGetUser).toHaveBeenCalledWith("apple|001.abc", { fields: "identities", include_fields: true });
    });

    it("returns empty tokens when the identity has none exposed (missing read:user_idp_tokens)", async () => {
      mockGetUser.mockResolvedValue({ identities: [{ provider: "apple", connection: "apple", user_id: "001.abc" }] });

      await expect(service.getIdentityProviderTokens("apple|001.abc", "apple")).resolves.toEqual({
        accessToken: undefined,
        refreshToken: undefined,
      });
    });

    it("returns empty tokens when no identity matches the provider", async () => {
      mockGetUser.mockResolvedValue({ identities: [{ provider: "auth0", connection: "db", user_id: "abc" }] });

      await expect(service.getIdentityProviderTokens("auth0|abc", "apple")).resolves.toEqual({
        accessToken: undefined,
        refreshToken: undefined,
      });
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
    // Account deletion is the only caller, so a missing secret must fail that
    // one endpoint rather than stop the whole API from starting.
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
});
