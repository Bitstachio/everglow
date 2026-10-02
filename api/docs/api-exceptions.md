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
throw new ApiException(USERNAME_TAKEN_CODE, { username });
throw new ApiException(ONBOARDING_INCOMPLETE_CODE);
```

Status and description come from the registry (below). Do not pass a free-form
message or a string that is not in the catalog.

Source: [`src/common/errors/api.exception.ts`](../src/common/errors/api.exception.ts).

---

## Error definition registry

Each catalogue entry is `{ status, message }`, where `message` is either a
fixed string or a function of throw-time params. Messages are short operator
descriptions (no client CTAs, no trailing periods). UI prose stays on mobile.

**Domain slices** own the entries for their codes:

| Domain | File |
| --- | --- |
| HTTP generics | `src/common/errors/http.errors.ts` |
| Users | `src/users/users.errors.ts` |
| Events | `src/events/events.errors.ts` |
| Images | `src/images/images.errors.ts` |
| Plans | `src/plans/plans.errors.ts` |
| Photos | `src/photos/photos.errors.ts` |
| Rate limit | `src/common/rate-limit/rate-limit.errors.ts` |

**Aggregator** merges the slices into `API_ERROR_REGISTRY`, derives
`ApiErrorCode` / sorted `API_ERROR_CODES` (OpenAPI enum), and exposes
`resolveApiErrorMessage`:

[`src/common/errors/api-error-codes.ts`](../src/common/errors/api-error-codes.ts)

Shared types (`ApiErrorDefinition`, `ApiErrorParams`):
[`src/common/errors/api-error.types.ts`](../src/common/errors/api-error.types.ts)

### Adding a coded failure

1. Add a `*_CODE` constant in the domain (today often still in `*.constants.ts`;
   prefer colocating with the registry entry in `*.errors.ts` over time).
2. Add `{ status, message }` to that domain’s `*.errors.ts` slice.
3. Spread the slice into `API_ERROR_REGISTRY` if it is a new file.
4. Regenerate OpenAPI and the mobile client; add mobile UI copy for the new
   code (`API_ERROR_MESSAGES`).
5. Throw with `new ApiException(CODE)` or `new ApiException(CODE, params)`.

Do not invent a code unless a client will branch on it or needs distinct
translated copy. Prefer fewer codes; HTTP status plus filter-supplied generics
cover the rest.

---

## When to throw what

### Use `ApiException`

When the failure is a **known product outcome** the client must distinguish
from other failures with the same status—for example `USERNAME_TAKEN` vs a
generic 409, or `USERNAME_CHANGE_LIMITED` vs other 429s.

The code must already exist in `API_ERROR_REGISTRY`.

### Use a generic Nest HTTP exception

When the status alone is enough, or the failure must stay opaque:

- `NotFoundException` — resource missing; client does not need a
  domain-specific code.
- `BadRequestException` — validation / format guards the client already owns
  (e.g. username format after DTO + local checks).
- `UnauthorizedException()` with no body detail — session invalid or
  intentionally opaque (e.g. deleted / tombstoned accounts).
- Other Nest exceptions for coarse “forbidden” / “conflict” when there is no
  catalog code and no client branch.

Do **not** convert these to `ApiException` just to attach a code.
`AllExceptionsFilter` maps status → a generic catalog code when the exception
has none (see below).

### Do not

- Throw `ConflictException({ code: "SOME_STRING", message: "…" })` with a
  string outside the catalog.
- Put user-facing English in the API registry or in Nest messages for the app
  to display.
- Add a new specific code “just in case” with no client consumer.

---

## What the old constants pattern was for

Domain `*.constants.ts` files used to own large `*_SERVICE_ERRORS` maps:
human strings used both as Nest throw bodies and as de-facto client copy.

That is no longer the model for **coded** failures:

- Catalogued outcomes live in `*.errors.ts` (status + operator `message`).
- Clients key off `code`, not those strings.
- `*.constants.ts` should keep domain knobs (limits, patterns, prefixes), not
  a parallel error-message table for every API failure.

Legacy `USER_SERVICE_ERRORS`-style entries remain only where call sites still
throw uncoded Nest exceptions with local operator strings (e.g. modules not yet
cleaned up). The filter already supplies generic `code`/`message` for those
responses; shrink the string helpers as call sites stop needing them.

---

## Filter-supplied generic codes

When an `HttpException` (or unhandled throw) reaches `AllExceptionsFilter`
without a catalog `code`, the filter assigns one from status:

| Status | Code |
| --- | --- |
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `TOO_MANY_REQUESTS` |
| 500 (+ other 5xx) | `INTERNAL_ERROR` |
| other 4xx | `BAD_REQUEST` |

Definitions: [`src/common/errors/http.errors.ts`](../src/common/errors/http.errors.ts).

Rules:

- An existing catalog `code` on the exception body always wins (e.g.
  `ApiException`, `RateLimitExceededException` → `RATE_LIMIT_EXCEEDED`).
- For the generic fill-in, `message` comes from the registry — not from Nest
  constructor strings (those are not a client contract).
- Unhandled non-HTTP failures still log server-side; the client only sees
  `INTERNAL_ERROR` and the registry message (no stack / internal detail).
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
