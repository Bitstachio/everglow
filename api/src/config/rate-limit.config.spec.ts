import { RATE_LIMIT_TIER_DEFAULTS, RATE_LIMIT_TIER_NAMES } from "src/common/rate-limit/rate-limit.constants";
import rateLimitConfig, { parseTrustProxyEnv } from "./rate-limit.config";

describe("rateLimitConfig", () => {
  const MANAGED_VARS = [
    "RATE_LIMIT_ENABLED",
    "TRUST_PROXY",
    ...RATE_LIMIT_TIER_NAMES.flatMap((name) => [
      `RATE_LIMIT_${name.toUpperCase()}_LIMIT`,
      `RATE_LIMIT_${name.toUpperCase()}_TTL_SECONDS`,
    ]),
  ];

  const original = new Map(MANAGED_VARS.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    for (const name of MANAGED_VARS) delete process.env[name];
  });

  afterAll(() => {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe("tiers", () => {
    it("resolves every declared tier to its default when nothing is set", () => {
      expect(rateLimitConfig().tiers).toEqual(RATE_LIMIT_TIER_DEFAULTS);
    });

    it("orders the defaults: the global ceiling is looser than uploads, which is looser than sensitive", () => {
      const { default: global, uploads, sensitive } = rateLimitConfig().tiers;

      expect(global.limit / global.ttlSeconds).toBeGreaterThan(uploads.limit / uploads.ttlSeconds);
      expect(uploads.limit / uploads.ttlSeconds).toBeGreaterThan(sensitive.limit / sensitive.ttlSeconds);
    });

    it("overrides one tier from RATE_LIMIT_<TIER>_* without touching the others", () => {
      process.env.RATE_LIMIT_SENSITIVE_LIMIT = "3";
      process.env.RATE_LIMIT_SENSITIVE_TTL_SECONDS = "300";

      const { tiers } = rateLimitConfig();

      expect(tiers.sensitive).toEqual({ limit: 3, ttlSeconds: 300 });
      expect(tiers.uploads).toEqual(RATE_LIMIT_TIER_DEFAULTS.uploads);
      expect(tiers.default).toEqual(RATE_LIMIT_TIER_DEFAULTS.default);
    });

    // A zero limit would lock every caller out and a zero window would never
    // block anyone; a typo must fall back rather than do either.
    it.each(["0", "-5", "abc", "1.5", " "])("falls back to the default for the invalid value %p", (value) => {
      process.env.RATE_LIMIT_UPLOADS_LIMIT = value;
      process.env.RATE_LIMIT_UPLOADS_TTL_SECONDS = value;

      expect(rateLimitConfig().tiers.uploads).toEqual(RATE_LIMIT_TIER_DEFAULTS.uploads);
    });
  });

  describe("enabled", () => {
    it("is on when the variable is unset", () => {
      expect(rateLimitConfig().enabled).toBe(true);
    });

    it('is off only for exactly "false"', () => {
      process.env.RATE_LIMIT_ENABLED = "false";
      expect(rateLimitConfig().enabled).toBe(false);

      process.env.RATE_LIMIT_ENABLED = "0";
      expect(rateLimitConfig().enabled).toBe(true);
    });
  });

  describe("trustProxy", () => {
    it("reads TRUST_PROXY", () => {
      process.env.TRUST_PROXY = "1";

      expect(rateLimitConfig().trustProxy).toBe(1);
    });

    it.each([
      [undefined, false],
      ["", false],
      ["  ", false],
      ["false", false],
      ["true", true],
      ["0", 0],
      ["2", 2],
      ["loopback", "loopback"],
      [" 10.0.0.0/8, 172.16.0.0/12 ", "10.0.0.0/8, 172.16.0.0/12"],
    ])("parses %p as %p", (value, expected) => {
      expect(parseTrustProxyEnv(value)).toBe(expected);
    });
  });
});
