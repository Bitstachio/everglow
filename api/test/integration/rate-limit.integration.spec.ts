import { INestApplication } from "@nestjs/common";
import { Server } from "http";
import { RATE_LIMIT_EXCEEDED_CODE, RATE_LIMIT_EXCEEDED_MESSAGE } from "src/common/rate-limit/rate-limit.constants";
import rateLimitConfig, { RateLimitConfig } from "src/config/rate-limit.config";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { TEST_OTHER_ACCESS_TOKEN, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";

const ROOT_PATH = `/${API_GLOBAL_PREFIX}`;
const JOIN_PATH = `/${API_GLOBAL_PREFIX}/events/join`;
const ME_PATH = `/${API_GLOBAL_PREFIX}/users/me`;

const SENSITIVE_LIMIT = 2;
const DEFAULT_LIMIT = 5;
const TTL_SECONDS = 60;

const buildConfig = (overrides: Partial<RateLimitConfig> = {}): RateLimitConfig => ({
  enabled: true,
  trustProxy: false,
  tiers: {
    default: { limit: DEFAULT_LIMIT, ttlSeconds: TTL_SECONDS },
    sensitive: { limit: SENSITIVE_LIMIT, ttlSeconds: TTL_SECONDS },
    uploads: { limit: SENSITIVE_LIMIT, ttlSeconds: TTL_SECONDS },
  },
  ...overrides,
});

type ErrorBody = { message?: string; code?: string; meta: { timestamp: string; path: string } };

// The suite-wide setup file switches rate limiting off; these tests switch it
// back on with small limits by overriding the config provider, which is also
// what proves that guards, module, and trust-proxy wiring all read one config.
describe("Rate limiting (integration)", () => {
  let app: INestApplication;
  let httpServer: Server;

  const boot = async (config: RateLimitConfig = buildConfig()) => {
    ({ app } = await createTestApp((builder) => builder.overrideProvider(rateLimitConfig.KEY).useValue(config)));
    httpServer = app.getHttpServer() as Server;
  };

  // Outcomes other than 429 depend on unstubbed Prisma mocks and are not the
  // point: a request is either counted and let through, or rejected.
  const join = (token?: string) =>
    request(httpServer).post(JOIN_PATH).set(authHeader(token)).send({
      invitationUrl: "guessed-token",
    });

  const exhaust = async (send: () => request.Test, limit: number) => {
    for (let i = 0; i < limit; i++) {
      const response = await send();
      expect(response.status).not.toBe(429);
    }
  };

  afterEach(async () => {
    await app.close();
  });

  it("returns 429 in the error envelope with Retry-After once a tier's limit is spent", async () => {
    await boot();
    await exhaust(() => join(), SENSITIVE_LIMIT);

    const response = await join().expect(429);

    const body = response.body as ErrorBody;
    expect(body).toEqual({
      message: RATE_LIMIT_EXCEEDED_MESSAGE,
      code: RATE_LIMIT_EXCEEDED_CODE,
      meta: { timestamp: expect.any(String) as string, path: JOIN_PATH },
    });

    const retryAfter = Number(response.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(TTL_SECONDS);
  });

  it("keys a tier by authenticated user, so one user's block leaves another on the same IP alone", async () => {
    await boot();
    await exhaust(() => join(), SENSITIVE_LIMIT);
    await join().expect(429);

    const response = await join(TEST_OTHER_ACCESS_TOKEN);

    expect(response.status).not.toBe(429);
  });

  it("applies the default tier per IP across routes and users, before authentication", async () => {
    await boot();
    // One unauthenticated request (401) and authenticated requests from two
    // users all draw from the same IP bucket.
    await request(httpServer).get(ME_PATH).expect(401);
    await exhaust(() => request(httpServer).get(ME_PATH).set(authHeader()), DEFAULT_LIMIT - 2);
    await exhaust(() => request(httpServer).get(ME_PATH).set(authHeader(TEST_OTHER_ACCESS_TOKEN)), 1);

    const response = await request(httpServer).get(ME_PATH).expect(429);

    expect((response.body as ErrorBody).code).toBe(RATE_LIMIT_EXCEEDED_CODE);
  });

  it("never throttles a route marked @SkipRateLimit()", async () => {
    await boot();

    await exhaust(() => request(httpServer).get(ROOT_PATH), DEFAULT_LIMIT + 2);

    // Skipped requests were not counted either: the whole default budget is still there.
    await exhaust(() => request(httpServer).get(ME_PATH), DEFAULT_LIMIT);
  });

  describe("client IP behind a proxy", () => {
    const fromClient = (ip: string) => request(httpServer).get(ME_PATH).set("X-Forwarded-For", ip);

    it("ignores X-Forwarded-For by default, so a caller cannot choose their own bucket", async () => {
      await boot();
      for (let i = 0; i < DEFAULT_LIMIT; i++) await fromClient(`203.0.113.${i}`).expect(401);

      await fromClient("203.0.113.250").expect(429);
    });

    it("keys on the forwarded client address when TRUST_PROXY is set", async () => {
      await boot(buildConfig({ trustProxy: true }));
      for (let i = 0; i < DEFAULT_LIMIT; i++) await fromClient("203.0.113.1").expect(401);

      await fromClient("203.0.113.1").expect(429);
      await fromClient("203.0.113.2").expect(401);
    });
  });

  it("is off for every other integration suite via RATE_LIMIT_ENABLED=false", async () => {
    ({ app } = await createTestApp());

    expect(app.get<RateLimitConfig>(rateLimitConfig.KEY).enabled).toBe(false);
  });
});
