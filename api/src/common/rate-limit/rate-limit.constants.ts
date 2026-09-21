/**
 * The single source of truth for API rate limits. Every tier is declared here
 * once; controllers opt in by name with `@RateLimit("<tier>")` and never carry
 * numbers of their own. See docs/rate-limiting.md.
 */

export type RateLimitTierSettings = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length. A caller who exceeds the limit is blocked for one window. */
  ttlSeconds: number;
};

/**
 * Tier defaults. Each is overridable per environment with
 * `RATE_LIMIT_<TIER>_LIMIT` and `RATE_LIMIT_<TIER>_TTL_SECONDS`
 * (see src/config/rate-limit.config.ts and .env.example).
 */
export const RATE_LIMIT_TIER_DEFAULTS = {
  // Applied to every route by the global guard, keyed by client IP and shared
  // across routes. It runs before authentication, so it is a flood ceiling
  // rather than a per-user quota, and it is sized for a venue full of guests
  // behind one NAT address.
  default: { limit: 1000, ttlSeconds: 60 },
  // Guessable or destructive actions: joining by invitation, rotating an
  // invitation URL, onboarding, deleting the account.
  sensitive: { limit: 10, ttlSeconds: 60 },
  // Upload-slot minting. One request mints up to MAX_UPLOAD_BATCH_SIZE slots,
  // so this still allows hundreds of photos a minute.
  uploads: { limit: 30, ttlSeconds: 60 },
} as const satisfies Record<string, RateLimitTierSettings>;

export type RateLimitTierName = keyof typeof RATE_LIMIT_TIER_DEFAULTS;

export const RATE_LIMIT_TIER_NAMES = Object.keys(RATE_LIMIT_TIER_DEFAULTS) as RateLimitTierName[];

/** The tier the global guard applies to every route. */
export const GLOBAL_RATE_LIMIT_TIER = "default" satisfies RateLimitTierName;

/** Tiers an endpoint can opt into with `@RateLimit(...)`. */
export type EndpointRateLimitTier = Exclude<RateLimitTierName, typeof GLOBAL_RATE_LIMIT_TIER>;

export const RATE_LIMIT_EXCEEDED_CODE = "RATE_LIMIT_EXCEEDED";
export const RATE_LIMIT_EXCEEDED_MESSAGE = "Too many requests, please try again later";

export const RATE_LIMIT_TIER_METADATA = "rateLimit:tier";
export const RATE_LIMIT_SKIP_METADATA = "rateLimit:skip";

/** OpenAPI marker set by `@SkipRateLimit()`; consumed and removed by the 429 documenter. */
export const RATE_LIMIT_EXEMPT_EXTENSION = "x-rate-limit-exempt";
