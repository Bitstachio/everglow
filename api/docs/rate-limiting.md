# Rate Limiting

How the API limits request rates, and how to put a limit on a new endpoint. Everything lives in
[`src/common/rate-limit/`](../src/common/rate-limit) plus one config file,
[`src/config/rate-limit.config.ts`](../src/config/rate-limit.config.ts). It is built on
[`@nestjs/throttler`](https://github.com/nestjs/throttler).

## Adding a limit to an endpoint

One line on the handler, naming a tier:

```ts
@Post("join")
@RateLimit("sensitive")
async join(...) {}
```

That is the whole change. No numbers in controllers, no module imports (`RateLimitModule` is global), no
Swagger decorator (the 429 is documented centrally), no test changes (the integration suite runs with rate
limiting off).

To exempt a handler or a whole controller from every limit, the global default included:

```ts
@Get()
@SkipRateLimit()
getHello() {}
```

To add a tier, add one entry to `RATE_LIMIT_TIER_DEFAULTS` in
[`rate-limit.constants.ts`](../src/common/rate-limit/rate-limit.constants.ts). The `@RateLimit` argument type,
the env override names, and the config all derive from that object. Document the new env pair in `.env.example`.

## Tiers

Declared once in `RATE_LIMIT_TIER_DEFAULTS`. Each is overridable per environment with
`RATE_LIMIT_<TIER>_LIMIT` and `RATE_LIMIT_<TIER>_TTL_SECONDS`; an invalid or non-positive value falls back to the
default (`parseIntegerEnv`, same convention as the other config files).

| Tier        | Default     | Keyed by                           | Bucket spans | Applied to                                                                                                                                                                                                                                                                                               |
| ----------- | ----------- | ---------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`   | 1000 / 60 s | client IP                          | all routes   | Every route, automatically (global guard). `GET /api/v2` is exempt.                                                                                                                                                                                                                                      |
| `sensitive` | 10 / 60 s   | user id (IP if the route has none) | one route    | `POST /events/join`, `POST /events/:eventId/regenerate-url`, `POST /users/me/onboarding`, `DELETE /users/me`, `POST /photos/:photoId/reports`, `POST /events/:eventId/participants/:targetUserId/reports`, `PATCH /reports/:reportId`, `PUT /users/me/blocks/:userId`, `DELETE /users/me/blocks/:userId` |
| `uploads`   | 30 / 60 s   | user id (IP if the route has none) | one route    | `POST /events/:eventId/photos/upload-urls` (up to 20 slots per request, so 600 slots a minute)                                                                                                                                                                                                           |

Semantics: a caller may make `limit` requests per window. The request that exceeds it starts a block lasting one
window (`Retry-After` counts it down); requests during a block are rejected and not counted. Every request that
reaches a guard counts, whatever its outcome, so ten wrong invitation guesses spend the `join` budget just as ten
successful joins would.

A route with `@RateLimit` is subject to both its tier and the global default. The tiers are independent buckets.

## Keying and guard order

The rule: **per authenticated user where a verified user exists, per client IP otherwise.**

The constraint that shapes the design: Nest runs guards in the order global, controller, handler. A global
`APP_GUARD` therefore runs _before_ the controller-level `JwtAuthGuard`, when `req.user` is not set yet. A single
global guard cannot key by user. Reading the user id out of the bearer token at that point would mean trusting an
unverified token, and an attacker could put a different `sub` in each request to mint unlimited fresh buckets.

So there are two guards sharing one base class (`rate-limit.guard.ts`):

1. **`IpRateLimitGuard`**, registered as `APP_GUARD`. Runs first on every request, enforces the `default` tier,
   keys on the client IP only, and never looks at the token. Because it runs before authentication it also bounds
   unauthenticated traffic: requests that will end in a 401 are counted and throttled like any others. It is a
   flood ceiling per address, not a per-user quota, and its default is sized for many guests behind one venue NAT.
2. **`UserRateLimitGuard`**, attached by `@RateLimit(tier)` with `UseGuards` at **handler** level. Handler-level
   guards run after controller-level ones, so by then `JwtAuthGuard` has verified the token and `req.user.id` is
   trustworthy. It keys on that id. On a route with no authenticated user (none exists today) it falls back to the
   client IP.

This is why `@RateLimit` is typed as a method decorator: on a class it could be ordered before
`@UseGuards(JwtAuthGuard)` and silently degrade to IP keying.

Other keying details:

- Trackers are prefixed (`user:<id>`, `ip:<addr>`), so a user id can never collide with an address.
- IPv6 addresses are folded to their /64 (throttler's `normalizeIp`), so one host cannot rotate through its own
  subnet.
- Storage keys are SHA-256 hashes of `tier:scope:tracker`; raw ids and addresses are not stored as keys.
- A rejected request from an unauthenticated caller never reaches the user guard: `JwtAuthGuard` answers 401
  first, and only the IP tier has counted it.

## The 429 response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 37

{
  "message": "Too many requests, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "meta": { "timestamp": "...", "path": "/api/v2/events/join" }
}
```

- The guard throws `RateLimitExceededException`, an `HttpException` whose body carries `code`. It goes through
  `AllExceptionsFilter` like every other error, so the envelope is the standard one.
- `AllExceptionsFilter` now surfaces a string `code` from any `HttpException` body. That is what makes
  `RATE_LIMIT_EXCEEDED` reach the client, and it does the same for the codes that already existed
  (`STORAGE_QUOTA_EXCEEDED`, `STORAGE_RESERVATION_CONFLICT`), which were previously thrown but dropped. No other
  body fields are exposed.
- `Retry-After` is whole seconds, at least 1. Throttler's own `X-RateLimit-*` / `Retry-After-<tier>` headers are
  switched off: with two tiers on a route they are ambiguous, and the suffixed retry header is not one clients
  understand.

### OpenAPI

The 429 is documented once. `documentRateLimitResponses` (`rate-limit.swagger.ts`) runs inside
`createOpenApiDocument`, adds a shared `#/components/responses/TooManyRequests`, and references it from every
operation except those marked `@SkipRateLimit()`. Controllers declare nothing. The response schema is the general
error envelope (`message?`, `code?`, `meta`) rather than one narrowed to this code, because it is the only error
body in the spec and generated clients derive each operation's error type from it.

Adding or removing `@SkipRateLimit()` changes the spec, so regenerate it and the mobile client. Adding
`@RateLimit` does not.

## Logging

One `warn` line, `event: "rate_limit.exceeded"`, with `tier`, `route` (`Controller.handler`), `keyedBy`
(`user` | `ip`), `userId` when keyed by user, and `retryAfterSeconds`. No IP address, token, or request data.

Ingress already logs every 429 as a `warn`, so `RateLimitRejectionLogger` emits its line **once per blocked bucket
per window**, not once per rejected request: a client hammering a blocked endpoint produces one line a minute, not
thousands. The memory behind that de-duplication is bounded (10 000 buckets, expired entries dropped first).

## Client IP behind a proxy: `TRUST_PROXY`

IP keying is only as good as `req.ip`. `configureApp` passes `TRUST_PROXY` to Express's
[`trust proxy`](https://expressjs.com/en/guide/behind-proxies.html) setting:

| `TRUST_PROXY`      | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| unset / `false`    | **Default.** `X-Forwarded-For` is ignored; `req.ip` is the socket address.                       |
| a number, e.g. `1` | Trust that many proxy hops in front of the app. The usual setting behind one load balancer.      |
| an address list    | e.g. `loopback, 10.0.0.0/8`. Trust only those proxies. An unparseable list fails at boot.        |
| `true`             | Trust every hop. Only safe if the app is unreachable except through a proxy that overwrites XFF. |

Both wrong settings fail badly, which is why it is explicit rather than hardcoded. Off behind a proxy: every
client shares the proxy's address and the whole user base shares one `default` bucket. On with nothing in front:
any caller sets `X-Forwarded-For` and picks a fresh bucket per request. The app is not deployed yet; set this
when the topology is known, and verify with a request through the real load balancer.

## Storage, and the multi-instance caveat

Counters live behind throttler's `ThrottlerStorage` interface. The only place that chooses an implementation is
`createRateLimitStorage()` in [`rate-limit.storage.ts`](../src/common/rate-limit/rate-limit.storage.ts), which
`RateLimitModule` hands to `ThrottlerModule`. Today it returns throttler's in-memory store.

In-memory counters are per process. With N API instances behind a load balancer each keeps its own count, so a
caller effectively gets up to N times every limit, and a restart clears all counts. That is acceptable for a
single instance. Before scaling out, return a shared store from `createRateLimitStorage()` (for example
`@nest-lab/throttler-storage-redis`); guards, decorators, and controllers do not change. The log
de-duplication is also per process, so N instances may each log a blocked bucket once.

## Testing

- **One switch.** `test/integration/jest-integration.setup.ts` sets `RATE_LIMIT_ENABLED=false`, so every
  integration suite runs unthrottled with no per-suite overrides. With the switch off the guards return before
  touching storage, which also means no throttler timers are left pending.
- **Opting back in.** `test/integration/rate-limit.integration.spec.ts` overrides the config provider through
  `createTestApp`'s existing hook, with small limits:

  ```ts
  createTestApp((builder) => builder.overrideProvider(rateLimitConfig.KEY).useValue({ enabled: true, ... }));
  ```

  It covers the 429 envelope and `Retry-After`, per-user keying, the pre-auth IP tier, the skip path, and
  `TRUST_PROXY` on and off.

- **Unit tests** build the guards directly with a fake `ThrottlerStorage`
  (`rate-limit.guard.spec.ts`): tier resolution, user vs IP keying, per-route buckets, skip, disabled. Config
  parsing, the rejection logger, the OpenAPI documenter, and the filter's `code` passthrough have their own specs.
- Unit tests of controllers or services are unaffected: guards only exist in a booted app.

`RATE_LIMIT_ENABLED=false` is also available as an operational kill switch.
