import { ConfigType, registerAs } from "@nestjs/config";
import {
  RATE_LIMIT_TIER_DEFAULTS,
  RATE_LIMIT_TIER_NAMES,
  RateLimitTierName,
  RateLimitTierSettings,
} from "src/common/rate-limit/rate-limit.constants";
import { parseIntegerEnv } from "src/common/utils/env.utils";

/** Value handed to Express's `trust proxy` setting. */
export type TrustProxySetting = boolean | number | string;

const DECIMAL_HOP_COUNT = /^\d+$/;

/**
 * Off unless set. `true` trusts every hop (only safe when the app is reachable
 * solely through a proxy that overwrites X-Forwarded-For), a number trusts that
 * many hops, and anything else is passed to Express as an address list
 * ("loopback", "10.0.0.0/8, 172.16.0.0/12"). An unparseable address list makes
 * Express throw at boot, which is the right failure for a setting that decides
 * whose IP a limit is charged to.
 */
export const parseTrustProxyEnv = (value: string | undefined): TrustProxySetting => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "false") return false;
  if (trimmed === "true") return true;
  if (DECIMAL_HOP_COUNT.test(trimmed)) return Number(trimmed);
  return trimmed;
};

const tierFromEnv = (name: RateLimitTierName): RateLimitTierSettings => {
  const prefix = `RATE_LIMIT_${name.toUpperCase()}`;
  const defaults = RATE_LIMIT_TIER_DEFAULTS[name];

  return {
    limit: parseIntegerEnv(process.env[`${prefix}_LIMIT`], defaults.limit, 1),
    ttlSeconds: parseIntegerEnv(process.env[`${prefix}_TTL_SECONDS`], defaults.ttlSeconds, 1),
  };
};

const rateLimitConfig = registerAs("rateLimit", () => ({
  // On unless set to exactly "false". The integration suite turns it off in one
  // place (test/integration/jest-integration.setup.ts).
  enabled: process.env.RATE_LIMIT_ENABLED !== "false",
  trustProxy: parseTrustProxyEnv(process.env.TRUST_PROXY),
  tiers: Object.fromEntries(RATE_LIMIT_TIER_NAMES.map((name) => [name, tierFromEnv(name)])) as Record<
    RateLimitTierName,
    RateLimitTierSettings
  >,
}));

export type RateLimitConfig = ConfigType<typeof rateLimitConfig>;

export default rateLimitConfig;
