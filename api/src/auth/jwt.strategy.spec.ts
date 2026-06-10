jest.mock("jwks-rsa", () => ({
  passportJwtSecret: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock("passport-jwt", () => {
  class MockJwtStrategy {
    name = "jwt";
  }

  return {
    ExtractJwt: {
      fromAuthHeaderAsBearerToken: jest.fn(),
    },
    Strategy: MockJwtStrategy,
  };
});

import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { UsersService } from "src/users/users.service";
import { UserWithDetails } from "src/users/users.types";
import { JwtPayloadDto } from "./jwt-payload.dto";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  let usersService: DeepMockProxy<UsersService>;

  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const payload: JwtPayloadDto = {
    sub: providerSub,
    iat: 1710000000,
    exp: 1710003600,
  };

  const resolvedUser: UserWithDetails = {
    id: userId,
    providerSub,
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  beforeEach(async () => {
    usersService = mockDeep<UsersService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const config: Record<string, string> = {
                "auth0.domain": "test.example.auth0.com",
                "auth0.audience": "https://api.test.example.com",
                "auth0.jwksUri": "https://test.example.auth0.com/.well-known/jwks.json",
              };

              if (!(key in config)) {
                throw new Error(`Config key "${key}" not found`);
              }

              return config[key];
            }),
          },
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validate", () => {
    it("resolves the user by provider sub and returns the authenticated user", async () => {
      usersService.resolveByProviderSub.mockResolvedValue(resolvedUser);

      const result = await strategy.validate(payload);

      expect(usersService.resolveByProviderSub).toHaveBeenCalledWith(providerSub);
      expect(result).toEqual({ id: userId, sub: providerSub });
    });

    it("uses the resolved user id rather than the jwt subject as id", async () => {
      const otherUserId = "33333333-3333-3333-3333-333333333333";
      usersService.resolveByProviderSub.mockResolvedValue({
        ...resolvedUser,
        id: otherUserId,
      });

      const result = await strategy.validate(payload);

      expect(result.id).toBe(otherUserId);
      expect(result.sub).toBe(providerSub);
    });

    it("rethrows when user resolution fails", async () => {
      const error = new Error("Database unavailable");
      usersService.resolveByProviderSub.mockRejectedValue(error);

      await expect(strategy.validate(payload)).rejects.toThrow(error);
      expect(usersService.resolveByProviderSub).toHaveBeenCalledWith(providerSub);
    });
  });
});
