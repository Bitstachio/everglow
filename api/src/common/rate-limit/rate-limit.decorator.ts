import { SetMetadata, UseGuards, applyDecorators } from "@nestjs/common";
import { ApiExtension } from "@nestjs/swagger";
import {
  EndpointRateLimitTier,
  RATE_LIMIT_EXEMPT_EXTENSION,
  RATE_LIMIT_SKIP_METADATA,
  RATE_LIMIT_TIER_METADATA,
} from "./rate-limit.constants";
import { UserRateLimitGuard } from "./rate-limit.guard";

/**
 * Opts a route handler into a named tier from rate-limit.constants.ts, on top
 * of the global default. The bucket is per route and per authenticated user
 * (per client IP on a route with no user).
 *
 * Put it on the handler, not the class: method-level guards run after the
 * controller-level `JwtAuthGuard`, which is what makes `req.user` available
 * for keying.
 */
export const RateLimit = (tier: EndpointRateLimitTier): MethodDecorator =>
  applyDecorators(SetMetadata(RATE_LIMIT_TIER_METADATA, tier), UseGuards(UserRateLimitGuard));

/** Exempts a handler or a whole controller from every tier, the global default included. */
export const SkipRateLimit = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(RATE_LIMIT_SKIP_METADATA, true), ApiExtension(RATE_LIMIT_EXEMPT_EXTENSION, true));
