# Feature Code Organization

This document describes how we organize feature code in the Everglow mobile app.

**Reference implementation:** `features/profile/` is the only feature module that follows this structure today. Copy that layout and patterns when building new features.

**Legacy code:** `features/events/` and photos/gallery code (`app/(tabs)/gallery.tsx`, `lib/photo.ts`, related event screens) predate this structure and will be heavily refactored. Do not use them as examples. ESLint exempts legacy paths where old code would fail; see [ESLint enforcement](#eslint-enforcement).

```
mobile/
├── app/                          # Expo Router routes (thin entry points)
├── features/
│   └── <feature-name>/           # Self-contained feature modules
│       ├── screens/
│       ├── hooks/
│       ├── components/
│       ├── api/
│       ├── types.ts
│       └── utils.ts              # optional
├── components/                   # Shared UI primitives
├── context/                      # App-wide React context
├── hooks/                        # App-wide hooks
└── lib/                          # Shared utilities and API client
```

## Reference: profile feature

```
features/profile/
├── screens/
│   └── ProfileScreen.tsx
├── hooks/
│   └── useProfileScreen.ts
├── components/
│   └── EditProfileModal.tsx
├── api/
│   ├── keys.ts
│   └── mutations.ts
└── types.ts
```

## Layer responsibilities

### `screens/`

Top-level screen components. A screen should:

- Compose feature components and shared UI from `@/components/ui`
- Delegate state, side effects, and business logic to a screen hook
- Own layout and styling for the screen shell
- Default-export the screen component

Keep screens thin. If you find yourself writing `Alert.alert`, mutation calls, or complex state logic in a screen, move that into the screen hook.

**Example:** `ProfileScreen` calls `useProfileScreen()` and passes the returned values and handlers into `EditProfileModal`.

### `hooks/`

Screen-level hooks named `use<ScreenName>`. A screen hook should:

- Own local UI state (modals, form fields, loading flags)
- Call feature API hooks (`useQuery`, `useMutation`) from `api/`
- Read app-wide state from `@/context` when needed (for example, `useAuth`)
- Handle user actions (confirm dialogs, form submission, navigation triggers)
- Return everything the screen needs as a flat object

Export hooks as named exports.

**Example:** `useProfileScreen` manages the edit modal, builds the update payload, runs mutations, and surfaces `getErrorMessage` feedback via `Alert`.

### `components/`

Feature-specific UI pieces used by one or more screens in the same feature. A component should:

- Be mostly presentational: receive data and callbacks via props
- Not call the API directly
- Use shared primitives from `@/components/ui` where possible
- Export as named exports

Place a component in `components/` when it is specific to this feature. Place it in `@/components/` when it is reused across multiple features.

**Example:** `EditProfileModal` receives `editForm`, `onSave`, and `onCancel` from the screen hook via props.

### `api/`

All server communication for the feature lives here. Split by concern:

| File | Purpose |
|------|---------|
| `keys.ts` | React Query key factory for this feature |
| `queries.ts` | `useQuery` hooks (add when the feature fetches data) |
| `mutations.ts` | `useMutation` hooks |

#### `keys.ts`

Define a key factory object with an `all` root key and specific key functions. Reuse generated query key helpers from the OpenAPI client when available.

```ts
import { usersControllerFindMeQueryKey } from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  all: ["profile"] as const,
  me: () => usersControllerFindMeQueryKey(),
};
```

Use `profileKeys.all` for broad invalidation and `profileKeys.me()` for a specific cache entry.

#### `mutations.ts`

Wrap generated SDK functions in `useMutation` hooks. Follow this pattern:

1. Call the generated SDK function with `throwOnError: true`
2. Unwrap the API envelope with `unwrapEnvelope`
3. Update React Query cache and/or app context in `onSuccess`
4. Export a named hook (for example, `useUpdateProfileMutation`)

```ts
const { data } = await usersControllerUpdateMe({ body, throwOnError: true });
return unwrapEnvelope(data);
```

#### `queries.ts` (when needed)

Add this file when a screen fetches data with React Query instead of reading it from context or local state. Use generated `*Options` helpers from `@/lib/api/generated/@tanstack/react-query.gen` where possible, and reference keys from `keys.ts`.

Profile does not have a `queries.ts` file because the current user is provided by `useAuth`. Use queries when the feature owns its own fetch lifecycle.

### `types.ts`

Re-export only the types the feature needs from the generated API client. Do not duplicate DTO definitions.

```ts
export type { UpdateUserDto, UserResponseDto } from "@/lib/api/generated";
```

Add feature-local types (form shapes, UI enums) in the hook or component file that owns them, unless multiple files in the feature need the same type.

### `utils.ts` (optional)

Pure helper functions with no React or API dependencies. Add only when logic is shared across multiple files in the feature.

## Routing (`app/`)

Expo Router files in `app/` are thin entry points. They should re-export the feature screen, not contain feature logic.

```ts
// app/(tabs)/profile.tsx
export { default } from "@/features/profile/screens/ProfileScreen";
```

Route-specific params, layouts, and navigation guards can live in `app/`, but screens and business logic belong in `features/`.

## Data flow

```
app/(tabs)/profile.tsx
        │
        ▼
screens/ProfileScreen.tsx          ← layout + composition
        │
        ├── hooks/useProfileScreen.ts   ← state, handlers, orchestration
        │         │
        │         ├── api/mutations.ts  ← useMutation hooks
        │         ├── context/auth    ← app-wide user state
        │         └── lib/api/errors    ← user-facing error messages
        │
        └── components/EditProfileModal.tsx   ← presentational UI
```

## Shared infrastructure

These live outside `features/` and are used across the app.

### API client (`lib/api/`)

| Path | Role |
|------|------|
| `generated/` | Auto-generated SDK, types, and React Query helpers. **Do not edit by hand.** Regenerate with `npm run openapi:generate`. |
| `axios-instance.ts` | Axios instance with auth token injection and 401 handling |
| `hey-api.config.ts` | Wires the generated client to our Axios instance |
| `envelope.ts` | `unwrapEnvelope` for the `{ data, meta }` API response shape |
| `errors.ts` | `toApiError` (used by the Axios interceptor) and `getErrorMessage` (for UI error messages) |

Generated SDK functions are imported from `@/lib/api/generated`. Query key helpers and `*Options` / `*Mutation` factories are in `@/lib/api/generated/@tanstack/react-query.gen`.

Prefer wrapping generated helpers in feature `api/` hooks rather than calling the SDK directly from screens or components.

### React Query (`lib/query/`, `providers/query-provider.tsx`)

- `QueryProvider` wraps the app in `app/_layout.tsx`
- Default query options: 60s stale time, 2 retries, refetch on focus
- Feature mutations should update or invalidate keys from the feature's `keys.ts`

### Shared UI (`components/ui/`)

Reusable primitives such as `Button` and `Input`. Feature components should compose these instead of reimplementing common patterns.

### App-wide hooks and context (`hooks/`, `context/`)

- `hooks/` for cross-feature hooks (for example, `useColorScheme`)
- `context/` for global state (for example, `AuthProvider` / `useAuth`)

Feature hooks may depend on app-wide context. Avoid the reverse: context should not import from `features/`.

## Conventions

### Imports

Use the `@/` path alias for all internal imports:

```ts
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
```

Use relative imports only for files within the same feature (for example, `../api/mutations`).

### Naming

| Item | Convention | Example |
|------|------------|---------|
| Feature folder | kebab-case or lowercase single word | `profile`, `event-invites` |
| Screen file | PascalCase + `Screen` | `ProfileScreen.tsx` |
| Screen hook | `use` + screen name | `useProfileScreen` |
| Query keys export | `<feature>Keys` | `profileKeys` |
| Mutation hooks | `use<Action><Entity>Mutation` | `useUpdateProfileMutation` |

### Error handling

- API layer: Axios interceptor converts failures to `Error` via `toApiError`
- UI layer: use `getErrorMessage(error, "Fallback message")` in mutation `onError` callbacks

### Functions

Use arrow functions instead of the `function` keyword in feature code.

```ts
// Preferred
const ProfileScreen = () => { ... };
export const useProfileScreen = () => { ... };
const handleSave = () => { ... };

// Avoid
function ProfileScreen() { ... }
export function useProfileScreen() { ... }
const handleSave = function () { ... };
```

Assign components, hooks, handlers, and helpers to `const` bindings with arrow syntax. Use concise arrow bodies when the function only returns a value.

### Exports

- Screens: default export
- Hooks, components, API hooks, keys: named exports

## Adding a new feature

1. Create `features/<name>/` with `screens/`, `hooks/`, `components/`, and `api/` as needed
2. Add `types.ts` with re-exports from `@/lib/api/generated`
3. Add `api/keys.ts` with a key factory
4. Add `api/queries.ts` and/or `api/mutations.ts` wrapping the generated SDK
5. Implement `use<Screen>Screen` hook with state and handlers
6. Build the screen as a thin composition layer
7. Wire the route in `app/` as a one-line re-export

## ESLint enforcement

`mobile/eslint.config.js` encodes several conventions from this document. Run `npm run lint` locally and in CI to catch violations early.

| Rule | Scope | What it enforces |
|------|-------|------------------|
| Arrow functions | `features/**` | No `function` declarations or expressions; use arrow functions and arrow callbacks |
| Feature self-imports | `features/<name>/**` | Import files inside the same feature with relative paths, not `@/features/<name>/...` |
| Presentational components | `features/**/components/**` | No `api/`, hooks, React Query, or generated SDK imports; named exports only |
| Thin screens | `features/**/screens/**` | No `api/`, React Query, generated SDK, or `Alert` imports (use a screen hook) |
| Screen hooks | `features/**/hooks/**` | No generated SDK, screens, or components; named exports only |
| API hooks | `features/**/api/**` | Named exports only |
| Context boundary | `context/**` | No imports from `@/features/*` |
| Thin app routes | `app/**` (except legacy `app/events/**`) | Routes may import feature screens only, not hooks, components, or `api/` |

Layer rules target the profile pattern (`components/`, screen hooks, thin routes). Legacy exemptions exist only so old code keeps passing lint until refactor:

| Legacy path | ESLint exemption |
|-------------|------------------|
| `features/events/**` screens | Thin-screen rules (listed in `legacyFeatureNames`) |
| `app/events/**` | Thin-route rules |
| `features/events/component/**` | Not covered by `components/` rules (wrong folder name; do not copy) |

Photos/gallery has no `features/` module yet and is not part of this structure.

### Not enforced by ESLint

Lint cannot cover naming, API usage patterns, or how thin a screen really is. Use the [code review checklist](./code-review-checklist.md) during review for everything ESLint misses.

## Migrating legacy code

When refactoring `events`, gallery, or other pre-profile code, match `features/profile/` and remove the relevant ESLint exemptions in the same PR.
