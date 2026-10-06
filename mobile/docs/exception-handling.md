# Exception handling

How the mobile app turns API and transport failures into user-facing errors.
This is separate from [API](./api.md) (client setup, React Query, feature `api/`
hooks). Server catalog and when the API throws `ApiException`:
[api/docs/api-exceptions.md](../../api/docs/api-exceptions.md).

Copy for known API codes lives in the i18n `errors` namespace — see
[i18n](./i18n.md).

---

## Pipeline

There is no React error boundary for API failures. The global handler is the
**Axios response interceptor** on the shared instance.

```
HTTP / network failure
  → axios response interceptor (lib/api/axios-instance.ts)
      → 401: optional session-expired callback (auth context)
      → Promise.reject(toApiError(error))
  → feature mutation / query / form catch or onError
      → getErrorMessage(error, "Fallback…") for display
      → getErrorCode(error) when the UI must branch on a specific code
```

`toApiError` is the normalization step. Feature code should not re-read
`error.response?.data` or Nest `message` strings.

---

## Global handler (Axios interceptor)

Source: [`lib/api/axios-instance.ts`](../lib/api/axios-instance.ts).

On every failed response:

1. If status is **401**, call the handler registered via `setUnauthorizedHandler`
   (wired from auth context to clear the session and send the user to login).
2. Reject with **`toApiError(error)`** so callers always see an `ApiError`
   (or a safe wrapper), never a raw Axios error.

Success responses pass through unchanged. Request errors (no response) also go
through `toApiError` and become a network copy string.

---

## `toApiError` and the translation table

Source: [`lib/api/errors.ts`](../lib/api/errors.ts),
[`lib/api/error-messages.ts`](../lib/api/error-messages.ts),
[`locales/en/errors/`](../locales/en/errors/).

| Input                                | What the user sees                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| HTTP response with `data.code` (4xx) | `messageForApiErrorCode(code)` via i18n `errors:<code>`, or a generic safe string if the code is unknown |
| HTTP 5xx                             | Generic safe string from i18n (`common:error.generic`) — never the server body                           |
| Request made, no response            | `common:error.network`                                                                                   |
| Already an `ApiError`                | Unchanged                                                                                                |
| Other `Error` / unknown              | Wrapped; UI should prefer `getErrorMessage`’s fallback                                                   |

**Nest / API `message` is never shown.** The interceptor keeps `status`,
`code`, and `Retry-After` (as `retryAfterSeconds`) on the `ApiError` for
branching; display text comes only from the locale catalogs (or the safe /
network fallbacks above).

`getErrorMessage` re-resolves known 4xx codes through i18n at read time, so a
later locale switch does not require recreating the error. A 5xx response stays
on `common:error.generic` even when `code` is set.

---

## Translation table layout

| Piece      | Path                                                                             |
| ---------- | -------------------------------------------------------------------------------- |
| Aggregator | `lib/api/error-messages.ts` (`API_ERROR_MESSAGE_DOMAINS` → `API_ERROR_MESSAGES`) |
| Domains    | `locales/en/errors/*.json` (merged in `locales/en/errors/catalog.ts`)            |
| Runtime    | i18n namespace `errors` (same keys as the English JSON)                          |

Each domain JSON matches an API `*.errors.ts` (e.g. `users.json` ↔
`users.errors.ts`). Put new copy in the domain that owns the API code, even when
the code name suggests another area.

Guards:

- `enErrors satisfies Record<ApiErrorCode, string>` fails the build when OpenAPI
  adds a code with no English string (or a key is mistyped).
- Domains must not share keys (`error-messages.spec.ts` checks the merged
  map length equals the sum of domain sizes). New domains are listed only in
  `EN_ERROR_MESSAGE_DOMAINS` / `API_ERROR_MESSAGE_DOMAINS` (same pattern as API
  `API_ERROR_DOMAINS`).

Copy is plain user-facing strings in locale JSON. Do not parse parameterized Nest
messages. If a screen needs a value the user already typed, compose it locally
with `getErrorCode`.

When a second language ships, add `locales/<code>/errors/` with the same keys;
`messageForApiErrorCode` already goes through i18next.

---

## What feature code does

In form / screen hooks (`onError`, `catch`, query error effects):

```ts
Alert.alert("Error", getErrorMessage(error, "Failed to update profile"));
// or
form.setError("username", { message: getErrorMessage(error) });
```

- Use **`getErrorMessage(error, fallback)`** for display. Copy comes from
  the `errors` i18n namespace via the interceptor; do not re-implement product
  prose in the feature.
- Use **`getErrorCode(error)`** only when **behavior** depends on a specific
  code (e.g. map `USERNAME_TAKEN` onto a field, or read `Retry-After` for
  `RATE_LIMIT_EXCEEDED`). Do not switch on `status` or `code` just to pick a
  display string—that means the API needs a catalog code and a translation
  entry (see [api-exceptions](../../api/docs/api-exceptions.md)).
- Do **not** read `error.response?.data`, Nest `message`, or raw
  `error.message` in screens for API failures (`getErrorMessage` returns the
  fallback for non-`ApiError` values).

Retry / refetch heuristics may still key off status when that is the shared
protocol (e.g. one retry on 409 for optimistic image confirms). **Display**
still goes through the translation table for the specific code.

Form submit feedback lives in form hooks; see [Forms](./forms.md). Screens
must not call `Alert` directly where ESLint bans it under `features/**/screens/**`.

---

## Adding copy for a new API code

1. API adds the code to the owning `*.errors.ts` and regenerates OpenAPI /
   the mobile client (see [api-exceptions](../../api/docs/api-exceptions.md)).
2. Add the user-facing string in the matching
   `locales/en/errors/<domain>.json`.
3. If the domain file is new, add it to `EN_ERROR_MESSAGE_DOMAINS` in
   `locales/en/errors/catalog.ts`.
4. Prefer `getErrorCode` in the feature only when the UI must branch; otherwise
   the interceptor + translation table is enough.

When migrating API errors, do not treat “no feature code references this yet”
as proof the outcome should stay a generic Nest throw. If the product outcome
will need distinct copy or a branch once the screen exists, the API should
already throw a catalog code and this table should already have an entry
(see [When to throw what](../../api/docs/api-exceptions.md#when-to-throw-what)).
