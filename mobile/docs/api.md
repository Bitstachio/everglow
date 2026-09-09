# API

This document covers server communication in the Everglow mobile app: the shared client under `lib/api/`, React Query setup, and the feature `api/` layer that wraps them.

**Convention hierarchy:** API code follows [codebase conventions](./code-conventions.md). Feature `api/` folders sit inside the layout defined by [feature code organization](./feature-code-organization.md).

**Reference implementation:** `features/profile/api/` is the model for feature API hooks. Do not copy patterns from `features/events/` or `lib/event.ts` / `lib/photo.ts`.

## Shared client (`lib/api/`)

| Path                | Role                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `generated/`        | Auto-generated SDK, types, and React Query helpers. **Do not edit by hand.** Regenerate with `npm run openapi:generate`. |
| `axios-instance.ts` | Axios instance with auth token injection and 401 handling                                                                |
| `hey-api.config.ts` | Wires the generated client to our Axios instance                                                                         |
| `envelope.ts`       | `unwrapEnvelope` for the `{ data, meta }` API response shape                                                             |
| `errors.ts`         | `toApiError` (used by the Axios interceptor) and `getErrorMessage` (for UI error messages)                               |

Generated SDK functions are imported from `@/lib/api/generated`. Query key helpers and `*Options` / `*Mutation` factories are in `@/lib/api/generated/@tanstack/react-query.gen`.

Prefer wrapping generated helpers in feature `api/` hooks rather than calling the SDK directly from screens, components, or form hooks.

## React Query (`lib/query/`, `providers/query-provider.tsx`)

- `QueryProvider` wraps the app in `app/_layout.tsx`
- Default query options: 60s stale time, 2 retries, refetch on focus
- Feature mutations should update or invalidate keys from the feature's `keys.ts`

## Feature `api/` layer

All server communication for a feature lives in `features/<name>/api/`. Split by concern:

| File           | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `keys.ts`      | React Query key factory for this feature             |
| `queries.ts`   | `useQuery` hooks (add when the feature fetches data) |
| `mutations.ts` | `useMutation` hooks                                  |

Export hooks and key factories as named exports. Screens and presentational components must not import the generated SDK or call Axios directly; they go through these hooks (enforced by ESLint; see [feature code organization](./feature-code-organization.md#eslint-enforcement)).

### `keys.ts`

Define a key factory object with an `all` root key and specific key functions. Reuse generated query key helpers from the OpenAPI client when available.

```ts
import { usersControllerFindMeQueryKey } from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  all: ["profile"] as const,
  me: () => usersControllerFindMeQueryKey(),
};
```

Use `profileKeys.all` for broad invalidation and `profileKeys.me()` for a specific cache entry.

### `queries.ts`

Add this file when a screen fetches data with React Query instead of reading it from context or local state. Use generated `*Options` helpers from `@/lib/api/generated/@tanstack/react-query.gen` where possible, and reference keys from `keys.ts`.

Profile does not have a `queries.ts` file because the current user is provided by `useAuth`. Use queries when the feature owns its own fetch lifecycle.

### `mutations.ts`

Wrap generated SDK functions in `useMutation` hooks. Follow this pattern:

1. Call the generated SDK function with `throwOnError: true`
2. Unwrap the API envelope with `unwrapEnvelope`
3. Update React Query cache and/or app context in `onSuccess`
4. Export a named hook (for example, `useUpdateProfileMutation`)

```ts
const { data } = await usersControllerUpdateMe({ body, throwOnError: true });
return unwrapEnvelope(data);
```

Auth-sensitive updates should also sync app context when appropriate (for example, `updateUser` after a profile update).

## Error handling

- **API layer:** the Axios interceptor converts failures to `Error` via `toApiError`. Feature code should not re-parse Axios response shapes.
- **UI layer:** use `getErrorMessage(error, "Fallback message")` in mutation `onError` callbacks or form-submit `catch` blocks. Do not read `error.response?.data` or raw `error.message` in screens.

## Naming

| Item              | Convention                         | Example                              |
| ----------------- | ---------------------------------- | ------------------------------------ |
| Query keys export | `<feature>Keys`                    | `profileKeys`                        |
| Mutation hooks    | `use<Action><Entity>Mutation`      | `useUpdateProfileMutation`           |
| Query hooks       | `use<Entity>` / `use<Entity>Query` | Prefer generated names when wrapping |

## Types

Re-export DTOs the feature needs from `@/lib/api/generated` in `features/<name>/types.ts`. Do not duplicate or hand-write parallel DTO definitions. Only export types the feature actually uses.

```ts
export type { UpdateUserDto, UserResponseDto } from "@/lib/api/generated";
```

Feature-local UI types stay in the hook or component that owns them unless shared across the feature.

## Adding API to a feature

1. Add `types.ts` re-exports from `@/lib/api/generated` for the DTOs you use.
2. Add `api/keys.ts` with an `all` root and specific key functions.
3. Add `api/queries.ts` and/or `api/mutations.ts` wrapping the generated SDK with `throwOnError` and `unwrapEnvelope`.
4. Call those hooks from feature hooks (screen hooks or form hooks), never from screens or presentational components.
5. On mutation success, update or invalidate keys from `keys.ts` (and sync context when needed).
6. Surface failures with `getErrorMessage`.

## Review checklist

- [ ] Server calls live in `api/`, split across `keys.ts`, `queries.ts`, and/or `mutations.ts`
- [ ] Generated SDK calls use `throwOnError: true`
- [ ] Responses are unwrapped with `unwrapEnvelope` before returning from `mutationFn` / `queryFn`
- [ ] Mutations update or invalidate cache through the feature key factory
- [ ] Auth-sensitive updates also sync app context when appropriate
- [ ] `queries.ts` is added when the feature owns fetch lifecycle; context or props are used when data is already available elsewhere
- [ ] Generated `*Options` and query key helpers are preferred over hand-rolled keys
- [ ] No hand-edits under `lib/api/generated/`
- [ ] UI errors use `getErrorMessage`, not raw Axios shapes
- [ ] DTOs are re-exported from `@/lib/api/generated`, not copied
