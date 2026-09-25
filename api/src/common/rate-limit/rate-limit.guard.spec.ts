import { ExecutionContext, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerStorage } from "@nestjs/throttler";
import { RateLimitConfig } from "src/config/rate-limit.config";
import { RateLimitRejectionLogger } from "./rate-limit-rejection.logger";
import { RATE_LIMIT_EXCEEDED_CODE, RATE_LIMIT_EXCEEDED_MESSAGE } from "./rate-limit.constants";
import { RateLimit, SkipRateLimit } from "./rate-limit.decorator";
import { RateLimitExceededException } from "./rate-limit.exception";
import { IpRateLimitGuard, UserRateLimitGuard } from "./rate-limit.guard";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "55555555-5555-5555-5555-555555555555";
const RETRY_AFTER_SECONDS = 42;

class FixtureController {
  @RateLimit("sensitive")
  sensitive(): void {}

  @RateLimit("uploads")
  uploads(): void {}

  plain(): void {}

  @SkipRateLimit()
  skipped(): void {}
}

@SkipRateLimit()
class SkippedController {
  @RateLimit("sensitive")
  sensitive(): void {}
}

type Hit = { key: string; ttl: number; limit: number; blockDuration: number; tier: string };

/** Counts hits per key and blocks past the limit, recording every call for assertions. */
class FakeStorage implements ThrottlerStorage {
  readonly hits: Hit[] = [];
  private readonly counts = new Map<string, number>();

  increment(key: string, ttl: number, limit: number, blockDuration: number, tier: string) {
    this.hits.push({ key, ttl, limit, blockDuration, tier });
    const totalHits = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, totalHits);

    return Promise.resolve({
      totalHits,
      timeToExpire: RETRY_AFTER_SECONDS,
      isBlocked: totalHits > limit,
      timeToBlockExpire: totalHits > limit ? RETRY_AFTER_SECONDS : 0,
    });
  }
}

type RequestShape = { ip?: string; user?: { id: string; sub: string }; headers?: Record<string, string> };

describe("rate limit guards", () => {
  let storage: FakeStorage;
  let record: jest.Mock;
  let header: jest.Mock;
  let config: RateLimitConfig;

  const buildContext = (
    handler: keyof FixtureController,
    req: RequestShape,
    controller: typeof FixtureController | typeof SkippedController = FixtureController,
  ): ExecutionContext =>
    ({
      getClass: () => controller,
      getHandler: () => controller.prototype[handler as keyof typeof controller.prototype],
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ...req }),
        getResponse: () => ({ header }),
      }),
    }) as unknown as ExecutionContext;

  const buildGuard = async <T extends IpRateLimitGuard | UserRateLimitGuard>(
    Guard: new (...args: ConstructorParameters<typeof IpRateLimitGuard>) => T,
  ): Promise<T> => {
    const guard = new Guard({ throttlers: [] }, storage, new Reflector(), config, {
      record,
    } as unknown as RateLimitRejectionLogger);
    await guard.onModuleInit();
    return guard;
  };

  const asUser = (id: string): RequestShape => ({ ip: "198.51.100.7", user: { id, sub: `auth0|${id}` } });

  beforeEach(() => {
    storage = new FakeStorage();
    record = jest.fn();
    header = jest.fn();
    config = {
      enabled: true,
      trustProxy: false,
      tiers: {
        default: { limit: 100, ttlSeconds: 60 },
        sensitive: { limit: 2, ttlSeconds: 30 },
        uploads: { limit: 5, ttlSeconds: 10 },
        lookup: { limit: 20, ttlSeconds: 10 },
      },
    };
  });

  describe("UserRateLimitGuard (attached by @RateLimit)", () => {
    it("resolves the limit and window of the tier named on the handler", async () => {
      const guard = await buildGuard(UserRateLimitGuard);

      await guard.canActivate(buildContext("sensitive", asUser(USER_ID)));
      await guard.canActivate(buildContext("uploads", asUser(USER_ID)));

      expect(storage.hits).toEqual([
        expect.objectContaining({ tier: "sensitive", limit: 2, ttl: 30_000, blockDuration: 30_000 }),
        expect.objectContaining({ tier: "uploads", limit: 5, ttl: 10_000, blockDuration: 10_000 }),
      ]);
    });

    it("does nothing on a handler with no tier", async () => {
      const guard = await buildGuard(UserRateLimitGuard);

      await expect(guard.canActivate(buildContext("plain", asUser(USER_ID)))).resolves.toBe(true);
      expect(storage.hits).toHaveLength(0);
    });

    it("keys by user id: same user on two IPs shares a bucket, two users on one IP do not", async () => {
      const guard = await buildGuard(UserRateLimitGuard);

      await guard.canActivate(buildContext("sensitive", { ip: "198.51.100.7", user: { id: USER_ID, sub: "a" } }));
      await guard.canActivate(buildContext("sensitive", { ip: "203.0.113.9", user: { id: USER_ID, sub: "a" } }));
      await guard.canActivate(buildContext("sensitive", { ip: "198.51.100.7", user: { id: OTHER_USER_ID, sub: "b" } }));

      const [first, second, third] = storage.hits.map((hit) => hit.key);
      expect(second).toBe(first);
      expect(third).not.toBe(first);
    });

    it("falls back to the client IP when the route has no authenticated user", async () => {
      const guard = await buildGuard(UserRateLimitGuard);

      await guard.canActivate(buildContext("sensitive", { ip: "198.51.100.7" }));
      await guard.canActivate(buildContext("sensitive", { ip: "198.51.100.7" }));
      await guard.canActivate(buildContext("sensitive", { ip: "203.0.113.9" }));

      const [first, second, third] = storage.hits.map((hit) => hit.key);
      expect(second).toBe(first);
      expect(third).not.toBe(first);
    });

    it("never derives a bucket from an unverified bearer token", async () => {
      const guard = await buildGuard(UserRateLimitGuard);
      const withToken = (token: string): RequestShape => ({
        ip: "198.51.100.7",
        headers: { authorization: `Bearer ${token}` },
      });

      await guard.canActivate(buildContext("sensitive", withToken("forged-1")));
      await guard.canActivate(buildContext("sensitive", withToken("forged-2")));

      expect(storage.hits[1].key).toBe(storage.hits[0].key);
    });

    it("keeps one bucket per route, so spending one endpoint's budget leaves another's intact", async () => {
      config.tiers.uploads = config.tiers.sensitive;
      const guard = await buildGuard(UserRateLimitGuard);

      await guard.canActivate(buildContext("sensitive", asUser(USER_ID)));
      await guard.canActivate(buildContext("uploads", asUser(USER_ID)));

      expect(storage.hits[1].key).not.toBe(storage.hits[0].key);
    });

    it("stores hashed keys, never the raw user id or address", async () => {
      const guard = await buildGuard(UserRateLimitGuard);

      await guard.canActivate(buildContext("sensitive", asUser(USER_ID)));

      expect(storage.hits[0].key).toMatch(/^[0-9a-f]{64}$/);
    });

    it("rejects with the coded 429, sets Retry-After, and reports the user once over the limit", async () => {
      const guard = await buildGuard(UserRateLimitGuard);
      const context = buildContext("sensitive", asUser(USER_ID));
      await guard.canActivate(context);
      await guard.canActivate(context);

      const rejection = await guard.canActivate(context).catch((error: unknown) => error);

      expect(rejection).toBeInstanceOf(RateLimitExceededException);
      const exception = rejection as RateLimitExceededException;
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(exception.getResponse()).toEqual({
        code: RATE_LIMIT_EXCEEDED_CODE,
        message: RATE_LIMIT_EXCEEDED_MESSAGE,
      });
      expect(header).toHaveBeenCalledWith("Retry-After", String(RETRY_AFTER_SECONDS));
      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith({
        bucketKey: storage.hits[0].key,
        tier: "sensitive",
        route: "FixtureController.sensitive",
        userId: USER_ID,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    });

    it("reports an IP-keyed rejection without a user id or address", async () => {
      config.tiers.sensitive.limit = 1;
      const guard = await buildGuard(UserRateLimitGuard);
      const context = buildContext("sensitive", { ip: "198.51.100.7" });
      await guard.canActivate(context);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(RateLimitExceededException);

      expect(record).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined }));
      expect(JSON.stringify(record.mock.calls)).not.toContain("198.51.100.7");
    });
  });

  describe("IpRateLimitGuard (global)", () => {
    it("applies the default tier to a handler with no decorator", async () => {
      const guard = await buildGuard(IpRateLimitGuard);

      await guard.canActivate(buildContext("plain", { ip: "198.51.100.7" }));

      expect(storage.hits).toEqual([expect.objectContaining({ tier: "default", limit: 100, ttl: 60_000 })]);
    });

    it("keys by IP across routes and ignores req.user even if one is present", async () => {
      const guard = await buildGuard(IpRateLimitGuard);

      await guard.canActivate(buildContext("plain", asUser(USER_ID)));
      await guard.canActivate(buildContext("sensitive", asUser(OTHER_USER_ID)));
      await guard.canActivate(buildContext("plain", { ip: "203.0.113.9" }));

      const [first, second, third] = storage.hits.map((hit) => hit.key);
      expect(second).toBe(first);
      expect(third).not.toBe(first);
    });

    it("folds IPv6 addresses in one /64 into a single bucket", async () => {
      const guard = await buildGuard(IpRateLimitGuard);

      await guard.canActivate(buildContext("plain", { ip: "2001:db8:1:2::1" }));
      await guard.canActivate(buildContext("plain", { ip: "2001:db8:1:2:ffff::9" }));
      await guard.canActivate(buildContext("plain", { ip: "2001:db8:1:3::1" }));

      const [first, second, third] = storage.hits.map((hit) => hit.key);
      expect(second).toBe(first);
      expect(third).not.toBe(first);
    });

    it("does not share a bucket with the user guard for the same caller", async () => {
      const ipGuard = await buildGuard(IpRateLimitGuard);
      const userGuard = await buildGuard(UserRateLimitGuard);

      await ipGuard.canActivate(buildContext("sensitive", { ip: "198.51.100.7" }));
      await userGuard.canActivate(buildContext("sensitive", { ip: "198.51.100.7" }));

      expect(storage.hits[1].key).not.toBe(storage.hits[0].key);
    });
  });

  describe("skip paths", () => {
    it.each([
      ["a handler marked @SkipRateLimit()", () => buildContext("skipped", { ip: "198.51.100.7" })],
      [
        "every handler of a controller marked @SkipRateLimit()",
        () => buildContext("sensitive", asUser(USER_ID), SkippedController),
      ],
    ])("counts nothing for %s", async (_label, context) => {
      const ipGuard = await buildGuard(IpRateLimitGuard);
      const userGuard = await buildGuard(UserRateLimitGuard);

      await expect(ipGuard.canActivate(context())).resolves.toBe(true);
      await expect(userGuard.canActivate(context())).resolves.toBe(true);

      expect(storage.hits).toHaveLength(0);
    });

    it("counts nothing when rate limiting is disabled", async () => {
      config.enabled = false;
      const ipGuard = await buildGuard(IpRateLimitGuard);
      const userGuard = await buildGuard(UserRateLimitGuard);

      await expect(ipGuard.canActivate(buildContext("plain", { ip: "198.51.100.7" }))).resolves.toBe(true);
      await expect(userGuard.canActivate(buildContext("sensitive", asUser(USER_ID)))).resolves.toBe(true);

      expect(storage.hits).toHaveLength(0);
    });
  });
});
