# Mobile Code Conventions

This document is the entry point for how we write TypeScript and React Native code in the Everglow mobile app. Conventions are layered: global rules apply everywhere, area rules apply to specific folders, and feature rules apply inside `features/`.

**Reference implementation:** `features/profile/` for feature structure. See [Feature code organization](./feature-code-organization.md) for the full feature guide.

**Enforcement:** `mobile/eslint.config.js` encodes what can be automated. Run `npm run lint` before opening a PR (lints `app/`, `components/`, `constants/`, `context/`, `features/`, `hooks/`, `lib/`, and `providers/`). Use the [code review checklist](./code-review-checklist.md) for everything lint cannot judge.

## Convention hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Codebase conventions (all app TS/TSX)                        │
│    Arrow functions, let/const, @/ imports, error handling       │
│    → This document, ESLint global rules                         │
├─────────────────────────────────────────────────────────────────┤
│ 2. Area conventions (folder-specific patterns)                  │
│    app/ routes, components/, context/, hooks/, lib/             │
│    → Sections below + targeted ESLint rules                     │
├─────────────────────────────────────────────────────────────────┤
│ 3. Feature module conventions (features/<name>/)                │
│    Layer boundaries, relative imports, export shapes, data flow │
│    → feature-code-organization.md + feature ESLint rules        │
├─────────────────────────────────────────────────────────────────┤
│ 4. Code review (human judgment)                                 │
│    Naming quality, API patterns, whether a screen is thin enough│
│    → code-review-checklist.md                                   │
└─────────────────────────────────────────────────────────────────┘
```

Higher layers inherit lower layers. Feature code must follow codebase conventions **and** feature-specific rules.

## 1. Codebase conventions

These apply to every `.ts` and `.tsx` file under `app/`, `components/`, `context/`, `features/`, `hooks/`, `lib/`, `providers/`, and `constants/`. Generated code under `lib/api/generated/` is excluded.

### Functions

Use arrow functions instead of the `function` keyword. Assign components, hooks, handlers, and helpers to `const` bindings.

```ts
// Preferred
export const AuthProvider = ({ children }: Props) => { ... };
export const useAuth = () => { ... };
const handleSave = () => { ... };
items.map((item) => item.id);

// Avoid
export function AuthProvider() { ... }
const handleSave = function () { ... };
items.map(function (item) { return item.id; });
```

Screens and route entry points may default-export a `const` component:

```ts
const ProfileScreen = () => { ... };
export default ProfileScreen;
```

### Variables

- Use `const` by default.
- Use `let` only when a binding is reassigned.
- Never use `var`.

### Imports

Use the `@/` path alias for cross-folder imports:

```ts
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
```

Inside a feature module, use relative imports for files in the same feature (for example, `../api/mutations`). See [Feature code organization](./feature-code-organization.md#imports).

### Error handling

- API layer: the Axios interceptor normalizes failures via `toApiError`.
- UI layer: use `getErrorMessage(error, "Fallback message")` in mutation `onError` callbacks. Do not read `error.response?.data` or raw `error.message` in screens.

### ESLint (global)

| Rule                    | What it enforces                                |
| ----------------------- | ----------------------------------------------- |
| `func-style`            | No `function` declarations; use `const` + arrow |
| `prefer-arrow-callback` | Arrow callbacks in `.map`, `.then`, etc.        |
| `no-restricted-syntax`  | No `function` expressions; use arrows           |
| `no-var`                | `var` is forbidden                              |
| `prefer-const`          | Use `const` when a binding is never reassigned  |

## 2. Area conventions

### `app/` — Expo Router routes

- Routes are thin entry points. Re-export feature screens; do not embed feature business logic.
- Layout files, param parsing, and navigation guards may live here.
- Prefer the profile route pattern:

```ts
export { default } from "@/features/profile/screens/ProfileScreen";
```

ESLint blocks imports of feature `hooks/`, `components/`, and `api/` (legacy `app/events/**` is exempt until refactor).

### `components/` — shared UI

- Reusable primitives used across features (`@/components/ui/`).
- Prefer named exports for shared components.
- Compose primitives instead of duplicating button, input, or text patterns.
- No feature-specific business logic.

### `context/` — app-wide React context

- Global state providers (`AuthProvider`, etc.).
- Must not import from `@/features/*` (enforced by ESLint).

### `hooks/` — app-wide hooks

- Cross-feature hooks (for example, `useColorScheme`).
- Feature screen hooks belong in `features/<name>/hooks/`, not here.

### `lib/` — shared utilities and API client

| Path                         | Role                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `lib/api/generated/`         | Auto-generated SDK. **Do not edit.** Regenerate with `npm run openapi:generate`. |
| `lib/api/axios-instance.ts`  | Axios with auth and 401 handling                                                 |
| `lib/api/envelope.ts`        | `unwrapEnvelope` for API responses                                               |
| `lib/api/errors.ts`          | `toApiError`, `getErrorMessage`                                                  |
| `lib/auth0.ts`, `lib/query/` | Auth and React Query setup                                                       |

Wrap generated SDK calls in feature `api/` hooks; do not call the SDK from screens or presentational components.

### `providers/`

App-level providers (for example, `QueryProvider`) wired in `app/_layout.tsx`.

## 3. Feature module conventions

Feature modules live under `features/<name>/` with layers: `screens/`, `hooks/`, `components/`, `api/`, `types.ts`, and optional `utils.ts`.

**Full guide:** [Feature code organization](./feature-code-organization.md)

Summary of what ESLint adds on top of codebase conventions:

| Rule                      | Scope                       | What it enforces                                           |
| ------------------------- | --------------------------- | ---------------------------------------------------------- |
| Feature self-imports      | `features/<name>/**`        | Relative imports inside the same feature                   |
| Presentational components | `features/**/components/**` | No `api/`, hooks, React Query, or SDK; named exports only  |
| Thin screens              | `features/**/screens/**`    | No `api/`, React Query, SDK, or `Alert`; use a screen hook |
| Screen hooks              | `features/**/hooks/**`      | No SDK, screens, or components; named exports only         |
| API hooks                 | `features/**/api/**`        | Named exports only                                         |

Legacy exemptions (`features/events/**`, `app/events/**`, `features/events/component/**`) exist so old code keeps passing lint until refactored to match `features/profile/`.

## 4. Code review

Lint cannot cover naming quality, whether a mutation invalidates the right keys, or how thin a screen really is. Use the [code review checklist](./code-review-checklist.md) during PR review.

## Quick reference

| I am writing…              | Follow                               |
| -------------------------- | ------------------------------------ |
| Any TS/TSX file            | Codebase conventions (this doc)      |
| A route in `app/`          | Area: `app/` + codebase              |
| Shared UI in `components/` | Area: `components/` + codebase       |
| A new feature              | All layers: feature guide + codebase |
| Reviewing a PR             | Checklist + `npm run lint`           |

## Migrating legacy code

When refactoring `events`, gallery, or other pre-profile code:

1. Match `features/profile/` structure and patterns.
2. Convert `function` declarations to arrow `const` bindings.
3. Remove the relevant ESLint legacy exemptions in the same PR.
