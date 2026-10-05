# API Exceptions and Error Codes

How the API throws HTTP failures that clients can recognize by a stable
`code`, and when to use a plain Nest exception instead.

Prisma-specific strategies (findOne guards, unique races) live in
[`service-error-handling.md`](./service-error-handling.md). This doc is about
the **error envelope** and the catalog that feeds it.

---

## Why `ApiException` exists

Clients translate and branch on a machine-readable `code` in the shared error
envelope (`ApiErrorDto`), not on Nest `message` strings. Mobile owns UI copy in
`API_ERROR_MESSAGES`; the API `message` is an operator / OpenAPI description.

Before `ApiException`, services threw Nest HTTP exceptions with an ad-hoc
`{ code, message }` object where `code` was a plain string. TypeScript did not
require that value to be in the OpenAPI enum (`API_ERROR_CODES`). A new coded
throw could ship without updating the catalog; generated clients and mobile
copy never learned about it.

`ApiException` closes that gap: its constructor takes `code: ApiErrorCode`, so
only catalogued codes compile.

```ts
throw new ApiException("USERNAME_TAKEN", { username });
throw new ApiException("ONBOARDING_INCOMPLETE");
```

Status and description come from the registry (below). Do not pass a free-form
message or a string that is not in the catalog. The string must be a key of
`API_ERROR_REGISTRY` (`ApiErrorCode`); TypeScript rejects unknown codes.

Source: [`src/common/errors/api.exception.ts`](../src/common/errors/api.exception.ts).

---

## Error definition registry

Each catalogue entry is `{ status, message }`, where `message` is either a
fixed string or a function of throw-time params. Messages are short operator
descriptions (no client CTAs, no trailing periods). UI prose stays on mobile.

**Domains** own the entries for their codes. List each domain object once in
`API_ERROR_DOMAINS`; the aggregator merges that list into one flat registry:

| Domain        | File                                         |
| ------------- | -------------------------------------------- |
| HTTP generics | `src/common/errors/http.errors.ts`           |
| Users         | `src/users/users.errors.ts`                  |
| Events        | `src/events/events.errors.ts`                |
| Images        | `src/images/images.errors.ts`                |
| Plans         | `src/plans/plans.errors.ts`                  |
| Photos        | `src/photos/photos.errors.ts`                |
| Rate limit    | `src/common/rate-limit/rate-limit.errors.ts` |

**Aggregator** merges the domains into `API_ERROR_REGISTRY`, derives
`ApiErrorCode` / sorted `API_ERROR_CODES` (OpenAPI enum), and exposes
`resolveApiErrorMessage`:

[`src/common/errors/api-error-codes.ts`](../src/common/errors/api-error-codes.ts)

Shared type: [`src/common/errors/api-error.types.ts`](../src/common/errors/api-error.types.ts)
(`ApiErrorDefinition`).

The **wire contract stays flat**: `ApiErrorDto.code` is one closed string enum.
Domain membership is catalog ownership (which `*.errors.ts` defines the code),
not a nested field on the response. Mobile UI copy files mirror those same
domain files (see [Mobile UI copy](#mobile-ui-copy)).

### Adding a coded failure

1. Add a key to the domain’s `*.errors.ts` registry object (literal keys such
   as `USERNAME_TAKEN` or `COVER_CHANGED_CONCURRENTLY`, no parallel `*_CODE`
   constant in `*.constants.ts`).
2. Set `{ status, message }` on that entry.
3. Add the domain object to `API_ERROR_DOMAINS` if it is a new file.
4. Regenerate OpenAPI and the mobile client.
5. Add mobile UI copy for the new code in the matching file under
   `mobile/lib/api/error-message-domains/` (and add the domain object to
   `API_ERROR_MESSAGE_DOMAINS` only if the file is new — that list is the
   single membership source; do not re-list domains when building
   `API_ERROR_MESSAGES`).
6. Throw with `new ApiException("THE_CODE")` or
   `new ApiException("THE_CODE", params)`.

Do not invent a code with neither a (current or expected) client branch nor
distinct translated copy. Prefer fewer codes; filter-supplied generics cover
true generics. When in doubt about copy, ask whether a client would need a
status/`getErrorMessage` workaround for this outcome—if yes, add a code even
if that screen is not built yet.

---

## Mobile UI copy

The app never shows Nest / API `message` bodies to users. Mobile maps `code` →
product copy in domain files under `mobile/lib/api/error-message-domains/`
(same domain split as the table above). Runtime flow (Axios interceptor,
`toApiError`, `getErrorMessage`):
[mobile/docs/exception-handling.md](../../mobile/docs/exception-handling.md).

When adding a coded failure, add the matching string there after regenerating
the OpenAPI client.

---

## When to throw what

### Use `ApiException`

When **any** of these is true (judge the **product outcome**, not only what
mobile already implements):

- The client must **branch** on this outcome vs other failures with the same
  status (e.g. `USERNAME_TAKEN` vs a generic 409).
- The client needs **distinct translated copy** for this outcome (e.g.
  `AVATAR_CHANGED_CONCURRENTLY`, `PASSWORD_CHANGE_NOT_AVAILABLE`). If a screen
  would otherwise special-case `status` or override `getErrorMessage` to show
  product prose, that prose belongs in `API_ERROR_MESSAGES` and the API must
  throw a catalog code.

A pathway in today’s frontend that shows a meaningful message is a strong
signal to code the error—but it is **not** the only signal. The mobile app is
incomplete: an endpoint may throw a product-specific failure before any screen
handles it. Ask whether a future (or existing) client **would** need a distinct
`code` and translation entry for that outcome. If yes, add the catalog code and
mobile copy now; do not leave it uncoded just because no hook reads it yet.

Hiding a control in the UI (e.g. Change Password for social identities) does
**not** mean the API may stay uncoded: if the failure can still reach
`getErrorMessage` / an Alert, give it a code and a translation entry.

The code must already exist in `API_ERROR_REGISTRY`.

### Use a generic Nest HTTP exception

When the generic status code’s translation is enough, or the failure must stay
opaque:

- `NotFoundException` — resource missing; `NOT_FOUND` copy is fine.
- `BadRequestException` — validation / format the client already owns locally
  (e.g. username format after DTO + form checks); no distinct API translation
  needed.
- `UnauthorizedException()` with no body detail — session invalid or
  intentionally opaque (e.g. deleted / tombstoned accounts).

`AllExceptionsFilter` maps status → a generic catalog code when the exception
has none (see below). Those generics (`FORBIDDEN`, `CONFLICT`, …) are for true
generics—not a substitute for product-specific copy.

If the throw carries a debug message, build it with
[`RESPONSE_TEMPLATES`](../src/common/constants/templates.constants.ts) (for
example `RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("User", "ID", id)`). Do not
inline an equivalent string. Omit the message when status alone is enough
(`throw new UnauthorizedException()`). Match template to status: not-found
throws use `RESOURCE.NOT_FOUND`, format-style bad requests use
`INVALID_FORMAT`, a value outside what is allowed uses `INVALID_VALUE`, and
so on—do not pass a bad-request template into `NotFoundException`. The
message is what the request's log line gives as `errorReason`, so write it
for whoever traces the request: name the field and the value.

**Lint** (`api/eslint.config.mjs`): outside tests, Nest HTTP exception
constructors may only take no argument or the matching
`RESPONSE_TEMPLATES` call — not a string literal, template literal, or other
helper. Specs are exempt so filter tests can pass raw Nest messages.
TypeScript cannot enforce this — Nest’s constructors accept `any`.

| Exception                      | Allowed first argument                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| `NotFoundException`            | `RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(...)` or none                     |
| `ConflictException`            | `RESPONSE_TEMPLATES.RESOURCE.ALREADY_EXISTS(...)` or none                |
| `BadRequestException`          | `RESPONSE_TEMPLATES.INVALID_FORMAT(...)` or `INVALID_VALUE(...)` or none |
| `ForbiddenException`           | none                                                                     |
| `UnauthorizedException`        | none                                                                     |
| `UnprocessableEntityException` | none                                                                     |

### Do not

- Throw `ConflictException({ code: "SOME_STRING", message: "…" })` with a
  string outside the catalog.
- Put user-facing English in the API registry or in Nest messages for the app
  to display.
- Leave a product outcome uncoded and rely on the client to infer meaning from
  HTTP status (or to hardcode display strings in a feature hook).
- Add a new specific code with **no** branch and **no** distinct translation.

---

## What the old constants pattern was for

Domain `*.constants.ts` files used to own large `*_SERVICE_ERRORS` maps and
parallel `*_CODE` constants: human strings used both as Nest throw bodies and
as de-facto client copy, with coded throws built as
`ForbiddenException({ code: SOME_CODE, message: … })`.

That model is gone:

- Catalogued outcomes live in `*.errors.ts` (status + operator `message`) and
  are thrown with `ApiException("THE_CODE")`.
- Clients key off `code`, not Nest constructor strings.
- `*.constants.ts` keeps domain knobs (limits, patterns, prefixes), not a
  parallel error-message table.
- Uncoded Nest throws use `RESPONSE_TEMPLATES` (or no message). The filter
  supplies generic `code`/`message` for those responses.

---

## Filter-supplied generic codes

When an `HttpException` (or unhandled throw) reaches `AllExceptionsFilter`
without a catalog `code`, the filter assigns one from status:

| Status            | Code                   |
| ----------------- | ---------------------- |
| 400               | `BAD_REQUEST`          |
| 401               | `UNAUTHORIZED`         |
| 403               | `FORBIDDEN`            |
| 404               | `NOT_FOUND`            |
| 409               | `CONFLICT`             |
| 429               | `TOO_MANY_REQUESTS`    |
| 422               | `UNPROCESSABLE_ENTITY` |
| 500 (+ other 5xx) | `INTERNAL_ERROR`       |
| other 4xx         | `BAD_REQUEST`          |

Definitions: [`src/common/errors/http.errors.ts`](../src/common/errors/http.errors.ts).

Rules:

- An existing catalog `code` on the exception body always wins (e.g.
  `ApiException`, `RateLimitExceededException` → `RATE_LIMIT_EXCEEDED`).
- For the generic fill-in, the client-facing `message` comes from the registry —
  not from Nest constructor strings (those are not a client contract).
- What the client does not see goes to the logs. For every error the filter
  records `errorCode` and `errorReason` on the response, and the request's
  completion line carries them, at `warn` for a 4xx and `error` for a 5xx (see
  [logging-conventions.md](./logging-conventions.md) §2). The reason is the
  exception's own message, or a validation failure's field errors.
- An uncoded **5xx** also gets its own **error** line with the stack and
  `REQUEST_UNHANDLED_ERROR`, the same alert path as an unhandled throw.
- Unhandled non-HTTP failures still log server-side at **error**; the client
  only sees `INTERNAL_ERROR` and the registry message (no stack / internal
  detail).
- Every error response includes both `code` and `message` (`ApiErrorDto`
  marks them required).

Specific product codes remain `ApiException`. Generics stay plain Nest throws.

---

## Envelope shape

`AllExceptionsFilter` writes `ApiErrorDto`: required `message`, required `code`,
and `meta`. Coded throws from `ApiException` use registry values; uncoded Nest
throws get a generic `code`/`message` as above. See
[`src/common/errors/api-error.dto.ts`](../src/common/errors/api-error.dto.ts)
and [`src/common/filters/all-exceptions.filter.ts`](../src/common/filters/all-exceptions.filter.ts).
