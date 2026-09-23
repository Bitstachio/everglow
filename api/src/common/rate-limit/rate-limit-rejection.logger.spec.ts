import { PinoLogger } from "nestjs-pino";
import { RateLimitRejection, RateLimitRejectionLogger } from "./rate-limit-rejection.logger";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("RateLimitRejectionLogger", () => {
  let warn: jest.Mock;
  let rejections: RateLimitRejectionLogger;

  const rejection = (overrides: Partial<RateLimitRejection> = {}): RateLimitRejection => ({
    bucketKey: "bucket-a",
    tier: "sensitive",
    route: "EventsController.join",
    userId: USER_ID,
    retryAfterSeconds: 30,
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-06-10T12:00:00.000Z") });
    warn = jest.fn();
    rejections = new RateLimitRejectionLogger({ setContext: jest.fn(), warn } as unknown as PinoLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("logs a structured warn with the tier, route and user id, and nothing that identifies the bucket", () => {
    rejections.record(rejection());

    expect(warn).toHaveBeenCalledWith(
      {
        event: "rate_limit.exceeded",
        tier: "sensitive",
        route: "EventsController.join",
        keyedBy: "user",
        userId: USER_ID,
        retryAfterSeconds: 30,
      },
      "Rate limit exceeded",
    );
  });

  it("marks an IP-keyed rejection without logging an address", () => {
    rejections.record(rejection({ userId: undefined, tier: "default" }));

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ keyedBy: "ip", userId: undefined, tier: "default" }),
      expect.any(String),
    );
  });

  it("logs a blocked bucket once per window however many requests it rejects", () => {
    for (let i = 0; i < 50; i++) rejections.record(rejection());

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("logs the same bucket again once its block has expired", () => {
    rejections.record(rejection());
    jest.advanceTimersByTime(30_000);
    rejections.record(rejection());

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("logs different buckets independently", () => {
    rejections.record(rejection({ bucketKey: "bucket-a" }));
    rejections.record(rejection({ bucketKey: "bucket-b" }));

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("stays bounded under a wide attack and keeps logging", () => {
    for (let i = 0; i < 10_050; i++) rejections.record(rejection({ bucketKey: `bucket-${i}` }));

    expect(warn).toHaveBeenCalledTimes(10_050);
    const remembered = (rejections as unknown as { loggedUntil: Map<string, number> }).loggedUntil;
    expect(remembered.size).toBeLessThanOrEqual(10_000);
  });
});
