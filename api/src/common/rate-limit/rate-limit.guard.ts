import { createHash } from "crypto";
import { ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
  normalizeIp,
} from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "src/auth/auth.types";
import rateLimitConfig, { type RateLimitConfig } from "src/config/rate-limit.config";
import { RateLimitRejectionLogger } from "./rate-limit-rejection.logger";
import {
  GLOBAL_RATE_LIMIT_TIER,
  RATE_LIMIT_SKIP_METADATA,
  RATE_LIMIT_TIER_METADATA,
  RateLimitTierName,
} from "./rate-limit.constants";
import { RateLimitExceededException } from "./rate-limit.exception";

type RateLimitedRequest = Request & { user?: AuthenticatedUser };

const USER_TRACKER_PREFIX = "user:";

const routeOf = (context: ExecutionContext): string => `${context.getClass().name}.${context.getHandler().name}`;

const userIdOf = (context: ExecutionContext): string | undefined =>
  context.switchToHttp().getRequest<RateLimitedRequest>().user?.id;

/**
 * Shared machinery for both guards: resolve the tier's numbers from config,
 * count the hit in the throttler storage, and turn a blocked bucket into the
 * API's 429 (envelope code, `Retry-After`, one log line). Subclasses only
 * decide which tier applies, who the bucket belongs to, and how wide it is.
 */
@Injectable()
abstract class BaseRateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(rateLimitConfig.KEY) private readonly config: RateLimitConfig,
    private readonly rejections: RateLimitRejectionLogger,
  ) {
    super(options, storageService, reflector);
  }

  /** The tier to enforce for this request, or undefined for none. */
  protected abstract resolveTier(context: ExecutionContext): RateLimitTierName | undefined;

  /** Who the bucket is charged to. Prefixed so a user id can never collide with an address. */
  protected abstract resolveTracker(context: ExecutionContext): string;

  /** What the bucket spans: every route, or a single one. */
  protected abstract resolveScope(context: ExecutionContext): string;

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.enabled || this.isSkipped(context)) return true;

    const tier = this.resolveTier(context);
    if (!tier) return true;

    const { limit, ttlSeconds } = this.config.tiers[tier];
    const ttl = ttlSeconds * 1000;

    return this.handleRequest({
      context,
      limit,
      ttl,
      blockDuration: ttl,
      // Throttler's own headers are suffixed per tier ("Retry-After-sensitive");
      // the plain `Retry-After` clients understand is set on rejection below.
      throttler: { name: tier, limit, ttl, setHeaders: false },
      getTracker: () => this.resolveTracker(context),
      generateKey: (_context, tracker, name) =>
        createHash("sha256")
          .update(`${name}:${this.resolveScope(context)}:${tracker}`)
          .digest("hex"),
    });
  }

  protected override throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const retryAfterSeconds = Math.max(1, detail.timeToBlockExpire);
    context.switchToHttp().getResponse<Response>().header("Retry-After", String(retryAfterSeconds));

    this.rejections.record({
      bucketKey: detail.key,
      tier: this.resolveTier(context) ?? GLOBAL_RATE_LIMIT_TIER,
      route: routeOf(context),
      userId: detail.tracker.startsWith(USER_TRACKER_PREFIX)
        ? detail.tracker.slice(USER_TRACKER_PREFIX.length)
        : undefined,
      retryAfterSeconds,
    });

    throw new RateLimitExceededException();
  }

  protected ipTracker(context: ExecutionContext): string {
    const { ip } = context.switchToHttp().getRequest<RateLimitedRequest>();
    // normalizeIp folds an IPv6 address into its /64, so one host cannot rotate
    // through its own subnet to mint fresh buckets.
    return `ip:${ip ? normalizeIp(ip, this.ipv6SubnetPrefix) : "unknown"}`;
  }

  private isSkipped(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(RATE_LIMIT_SKIP_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

/**
 * Global guard (APP_GUARD). Global guards run before the controller-level
 * `JwtAuthGuard`, so no verified identity exists yet: this guard keys on the
 * client IP only and never looks at the bearer token, which an attacker could
 * vary freely to mint fresh buckets. One bucket per IP across all routes.
 */
@Injectable()
export class IpRateLimitGuard extends BaseRateLimitGuard {
  protected resolveTier(): RateLimitTierName {
    return GLOBAL_RATE_LIMIT_TIER;
  }

  protected resolveTracker(context: ExecutionContext): string {
    return this.ipTracker(context);
  }

  protected resolveScope(): string {
    return "global";
  }
}

/**
 * Attached by `@RateLimit(tier)` at handler level, so it runs after the
 * controller-level `JwtAuthGuard` has verified the token and set `req.user`.
 * Keys on the user id; a route with no authenticated user falls back to the
 * client IP. One bucket per route.
 */
@Injectable()
export class UserRateLimitGuard extends BaseRateLimitGuard {
  protected resolveTier(context: ExecutionContext): RateLimitTierName | undefined {
    return this.reflector.get<RateLimitTierName | undefined>(RATE_LIMIT_TIER_METADATA, context.getHandler());
  }

  protected resolveTracker(context: ExecutionContext): string {
    const userId = userIdOf(context);
    return userId ? `${USER_TRACKER_PREFIX}${userId}` : this.ipTracker(context);
  }

  protected resolveScope(context: ExecutionContext): string {
    return routeOf(context);
  }
}
