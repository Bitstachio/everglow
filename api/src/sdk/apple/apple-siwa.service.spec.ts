import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { generateKeyPairSync } from "node:crypto";
import { PinoLogger } from "nestjs-pino";
import { APPLE_SIWA_ERRORS, APPLE_SIWA_REVOKE_URL } from "./apple-siwa.constants";
import { AppleSiwaService, AppleTokenRevocationError } from "./apple-siwa.service";

describe("AppleSiwaService", () => {
  const privateKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();

  const configured: Record<string, string | undefined> = {
    "apple.siwaTeamId": "TEAM123456",
    "apple.siwaKeyId": "KEYID12345",
    "apple.siwaClientId": "com.example.everglow",
    "apple.siwaPrivateKey": privateKey,
  };

  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  const buildService = async (config: Record<string, string | undefined>): Promise<AppleSiwaService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleSiwaService,
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();

    return module.get(AppleSiwaService);
  };

  const jsonResponse = (status: number, body?: unknown): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe("isRevocationConfigured", () => {
    it("is true only when every Apple credential is present", async () => {
      await expect(buildService(configured).then((s) => s.isRevocationConfigured())).resolves.toBe(true);
      await expect(
        buildService({ ...configured, "apple.siwaClientId": undefined }).then((s) => s.isRevocationConfigured()),
      ).resolves.toBe(false);
      await expect(buildService({}).then((s) => s.isRevocationConfigured())).resolves.toBe(false);
    });
  });

  describe("revokeToken", () => {
    it("posts the token with a freshly signed client secret to Apple's revoke endpoint", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200));
      const service = await buildService(configured);

      await expect(service.revokeToken("refresh-abc", "refresh_token")).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(APPLE_SIWA_REVOKE_URL);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);

      const body = init?.body as URLSearchParams;
      expect(body.get("client_id")).toBe("com.example.everglow");
      expect(body.get("token")).toBe("refresh-abc");
      expect(body.get("token_type_hint")).toBe("refresh_token");
      expect(body.get("client_secret")?.split(".")).toHaveLength(3);
    });

    it("treats Apple's 200 for an already-revoked token as success", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200));
      const service = await buildService(configured);

      await expect(service.revokeToken("already-gone", "access_token")).resolves.toBeUndefined();
    });

    it("fails without retry on a 400, carrying Apple's error code", async () => {
      fetchMock.mockResolvedValue(jsonResponse(400, { error: "invalid_client" }));
      const service = await buildService(configured);

      const failure = await service.revokeToken("refresh-abc", "refresh_token").catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(AppleTokenRevocationError);
      expect((failure as AppleTokenRevocationError).retryable).toBe(false);
      expect((failure as Error).message).toBe(APPLE_SIWA_ERRORS.REVOKE_REJECTED("invalid_client"));
    });

    it("fails without retry on a 400 whose body is not JSON", async () => {
      fetchMock.mockResolvedValue(new Response("nope", { status: 400 }));
      const service = await buildService(configured);

      const failure = await service.revokeToken("refresh-abc", "refresh_token").catch((e: unknown) => e);
      expect((failure as AppleTokenRevocationError).retryable).toBe(false);
      expect((failure as Error).message).toBe(APPLE_SIWA_ERRORS.REVOKE_REJECTED("unknown_error"));
    });

    it("fails with retry on a 5xx", async () => {
      fetchMock.mockResolvedValue(jsonResponse(503));
      const service = await buildService(configured);

      const failure = await service.revokeToken("refresh-abc", "refresh_token").catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(AppleTokenRevocationError);
      expect((failure as AppleTokenRevocationError).retryable).toBe(true);
      expect((failure as Error).message).toBe(APPLE_SIWA_ERRORS.REVOKE_UNAVAILABLE(503));
    });

    it("fails with retry when the request never gets a response", async () => {
      const cause = new Error("socket hang up");
      fetchMock.mockRejectedValue(cause);
      const service = await buildService(configured);

      const failure = await service.revokeToken("refresh-abc", "refresh_token").catch((e: unknown) => e);
      expect((failure as AppleTokenRevocationError).retryable).toBe(true);
      expect((failure as AppleTokenRevocationError).cause).toBe(cause);
    });

    it("fails without retry, and without calling Apple, when credentials are missing", async () => {
      const service = await buildService({});

      const failure = await service.revokeToken("refresh-abc", "refresh_token").catch((e: unknown) => e);
      expect((failure as AppleTokenRevocationError).retryable).toBe(false);
      expect((failure as Error).message).toBe(APPLE_SIWA_ERRORS.CREDENTIALS_NOT_CONFIGURED());
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
