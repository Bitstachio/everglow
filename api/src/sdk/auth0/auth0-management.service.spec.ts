import { NotImplementedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { Auth0ManagementService } from "./auth0-management.service";

describe("Auth0ManagementService", () => {
  let service: Auth0ManagementService;

  beforeEach(async () => {
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

  it("throws NotImplementedException from deleteUser", async () => {
    await expect(service.deleteUser("auth0|abc123")).rejects.toBeInstanceOf(NotImplementedException);
  });
});
