# Logging Conventions

This is the practical, project-specific companion to [`architectural-logging.md`](./architectural-logging.md).
That article explains _why_ we log the way we do; this document explains _how_ to do it in this codebase.
The `users` domain (`src/users`) is the reference implementation — copy its patterns into new domains.

---

## 1. The stack

We use [`nestjs-pino`](https://github.com/iamolegga/nestjs-pino) (a NestJS wrapper around
[`pino`](https://getpino.io) + [`pino-http`](https://github.com/pinojs/pino-http)). Structured JSON logging,
fast and low-overhead, with automatic per-request context.

- **`main.ts`** swaps NestJS's default logger for pino: `app.useLogger(app.get(Logger))`. This means even
  framework logs (`Logger` from `@nestjs/common`) flow through pino with our config.
- **`AppModule`** wires the logger via `LoggerModule.forRootAsync` using the factory in
  [`src/common/logging/logging.config.ts`](../src/common/logging/logging.config.ts). **All shared policy lives
  there** — redaction, correlation IDs, levels, serializers. Do not configure logging anywhere else.

---

## 2. What you get for free (do not re-implement)

`pino-http` runs at the ingress boundary, so the following already happen on every request. **Do not duplicate
them** in controllers or services:

- **Request/response bookends.** Each request is auto-logged once on completion with method, route, status code,
  and duration. You do not need to log "entering controller" / "request finished".
- **Correlation IDs.** Every request gets a `reqId` (`genReqId`). We honour an inbound `x-request-id` /
  `x-correlation-id` header if present, otherwise generate a UUID, and echo it back on the response. Because
  `nestjs-pino` stores the request logger in `AsyncLocalStorage`, **any log you emit during a request — even from
  a singleton service — automatically carries that `reqId`.** This is how one user's journey is reconstructed
  across layers. You never pass it manually.
- **Outcome-based severity for the auto log.** `customLogLevel` maps 5xx/throw → `error`, 4xx → `warn`, else
  `info`. A `404`/`409` from a service is already surfaced as a `warn` by ingress.
- **Unhandled exceptions.** `AllExceptionsFilter` (`src/common/filters`) emits one authoritative `error` with the
  stack for anything non-HTTP that escapes. **Do not catch-and-log-and-rethrow** just to record an error — you
  will create duplicate entries. Let it propagate.

---

## 3. Redaction & PII — the non-negotiable rule

Redaction is enforced centrally in `logging.config.ts` (`REDACT_PATHS`): `Authorization`/`cookie` headers,
`password`, `token`, `accessToken`, `refreshToken`, `secret`, `apiKey`, and `email` are censored to `[REDACTED]`
at the top level and one level deep. This is a **safety net, not a license to be careless.**

Rules:

- **Never log secrets or credentials** — not even masked/partial. If auth fails, log the principal id, not the
  submitted password or the bearer token.
- **Never log PII** (email, name, phone, address, government/health/financial data). Log the **opaque internal
  id** (`userId`) instead. "Which principal did this?" must be answerable without turning logs into a copy of the
  user directory.
- **Log keys, not values, when describing changes.** See `update()` in `UsersService`: it logs
  `fields: Object.keys(dto)` (e.g. `["email","name"]`), never the new values.
- If you add a new sensitive field anywhere in the app, add it to `REDACT_PATHS`.

---

## 4. Log level contract

Pick the level by **operational consequence**, not by how you feel. Default level is `debug` outside production
and `info` in production (override with `LOG_LEVEL`).

| Level     | Use for                                                                            | Example in this app                                  |
| --------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **debug** | Fine-grained troubleshooting detail. Off by default in prod.                       | "checking email uniqueness", branch taken            |
| **info**  | Healthy, expected business state transitions worth a permanent record.             | `user.onboarding.completed`, `user.provisioned`      |
| **warn**  | Unexpected-but-handled: retry succeeded, deprecated path, degraded dependency.     | downstream slow but within threshold                 |
| **error** | An operation failed and could not complete; invariant violated.                    | dependency unavailable with no fallback              |
| **fatal** | Process cannot continue safely (rare; usually precedes exit).                      | missing required config at boot                      |

Critical: **expected client errors are NOT `error`.** A `404` (user not found), `409` (email taken / already
onboarded), or `422` (onboarding incomplete) is a predictable outcome of normal client behaviour. We **throw the
HTTP exception and do not log it** — ingress already records it as a `warn`. Logging these at `error` is the
fastest way to train the team to ignore alerts.

---

## 5. How to log in a service

Inject `PinoLogger` and set the context to the class name (the context becomes a searchable field):

```ts
import { PinoLogger } from "nestjs-pino";

@Injectable()
export class WidgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WidgetsService.name);
  }
}
```

Then emit **structured** logs — a context object first, a short human message second:

```ts
this.logger.info({ event: "widget.published", widgetId: id }, "Widget published");
```

> `PinoLogger` is provided globally by `LoggerModule`, so there is nothing to add to your `WidgetsModule`. In unit
> tests, provide a stub (see §7).

### Field conventions

Keep field names consistent so logs are queryable across domains:

| Field     | Meaning                                                                                   |
| --------- | ----------------------------------------------------------------------------------------- |
| `event`   | Machine-stable dotted event name: `<domain>.<entity>.<action>` (e.g. `user.account.deleted`). Never reword it casually — dashboards key off it. |
| `userId`  | Opaque internal id of the affected/acting principal.                                      |
| `<x>Id`   | Opaque id of the entity acted on (`widgetId`, `orderId`, …).                              |
| `fields`  | `Object.keys(dto)` when recording a partial update — keys only.                           |
| `audit`   | `true` for high-value/destructive operations (deletes, permission changes).               |

The human message (second arg) is for humans skimming; the structured fields are what machines query. Don't
string-interpolate ids into the message when a field will do.

---

## 6. Where to place logs (layer guide)

- **Controllers:** usually nothing. Ingress bookends cover request-level visibility.
- **Services (business layer):** this is where the valuable logs live. Log **business state transitions** that
  carry meaning to support/product/engineering — not every internal step. In `UsersService`:
  - `createDetails` → `info user.onboarding.completed` (anonymous account becomes onboarded)
  - `update` → `info user.profile.updated` with changed field keys
  - `remove` → `info user.account.deleted` with `audit: true` (destructive, logged even on success)
  - `resolveByProviderSub` → `info user.provisioned` only when a new user is JIT-created on first login
- **Data/integration layer:** log the **boundaries of abnormal behaviour** — connection failures, timeouts, slow
  queries, circuit-breaker trips, external-API failures with a classified reason and latency. **Never log every
  query or full request/response payloads.** Use metrics for volume/latency; use logs for narrative.

Guiding question for any log line: _does this give perspective no other layer can, at a cost proportional to its
value?_ If ingress already says the request failed, the service should say _which business rule_ failed and the
integration layer _which dependency_ — and only one layer emits the definitive `error` for a given failure chain.

---

## 7. Testing services that log

`PinoLogger` is a constructor dependency, so unit tests must provide a stub (see
[`users.service.spec.ts`](../src/users/users.service.spec.ts)):

```ts
import { PinoLogger } from "nestjs-pino";

{
  provide: PinoLogger,
  useValue: {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}
```

---

## 8. Checklist for a new domain

- [ ] Inject `PinoLogger` and call `this.logger.setContext(MyService.name)` in the constructor.
- [ ] Add `info` logs for meaningful **business state transitions** only.
- [ ] Mark destructive / high-value operations with `audit: true`.
- [ ] Use the standard fields (`event`, `userId`, `<x>Id`, `fields`) and a dotted `event` name.
- [ ] Log **opaque ids, never PII or secrets**; add any new sensitive field to `REDACT_PATHS`.
- [ ] Do **not** log expected client errors (4xx) or re-log unhandled exceptions — ingress + the exception filter
      already do.
- [ ] Don't log inside hot loops or per-row; aggregate or use metrics.
- [ ] Provide a `PinoLogger` stub in the service's unit test.
