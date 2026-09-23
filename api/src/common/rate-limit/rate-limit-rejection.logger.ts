import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { RateLimitTierName } from "./rate-limit.constants";

export type RateLimitRejection = {
  /** Storage key of the exhausted bucket (already hashed, never logged). */
  bucketKey: string;
  tier: RateLimitTierName;
  /** `Controller.handler`, so the abused route is queryable without the URL. */
  route: string;
  /** Present when the bucket is keyed by user. IP-keyed rejections log no address. */
  userId?: string;
  retryAfterSeconds: number;
};

// Upper bound on remembered buckets. Reaching it means a very wide attack; the
// memory is dropped and a few buckets may log twice, which beats growing forever.
const MAX_REMEMBERED_BUCKETS = 10_000;

/**
 * Emits `rate_limit.exceeded` once per blocked bucket per window rather than
 * once per rejected request: ingress already records every 429 as a `warn`, so
 * this line only has to add what ingress cannot know (tier, route, user).
 */
@Injectable()
export class RateLimitRejectionLogger {
  private readonly loggedUntil = new Map<string, number>();

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(RateLimitRejectionLogger.name);
  }

  record({ bucketKey, tier, route, userId, retryAfterSeconds }: RateLimitRejection): void {
    const now = Date.now();
    if ((this.loggedUntil.get(bucketKey) ?? 0) > now) return;

    this.forgetExpired(now);
    this.loggedUntil.set(bucketKey, now + retryAfterSeconds * 1000);

    this.logger.warn(
      {
        event: ALERT_EVENTS.RATE_LIMIT_EXCEEDED,
        tier,
        route,
        keyedBy: userId ? "user" : "ip",
        userId,
        retryAfterSeconds,
      },
      "Rate limit exceeded",
    );
  }

  private forgetExpired(now: number): void {
    if (this.loggedUntil.size < MAX_REMEMBERED_BUCKETS) return;

    for (const [key, until] of this.loggedUntil) {
      if (until <= now) this.loggedUntil.delete(key);
    }

    if (this.loggedUntil.size >= MAX_REMEMBERED_BUCKETS) this.loggedUntil.clear();
  }
}
