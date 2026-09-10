# Mobile Code Conventions

This document is the entry point for how we write TypeScript and React Native code in the Everglow mobile app. Conventions are layered: global rules apply everywhere, area rules apply to specific folders, and topic docs cover feature structure, API usage, and forms.

**Reference implementation:** `features/profile/` for feature structure.

**Enforcement:** `mobile/eslint.config.js` encodes what can be automated. Run `npm run lint` before opening a PR (lints `app/`, `components/`, `constants/`, `context/`, `features/`, `hooks/`, `lib/`, and `providers/`). Use the [code review checklist](./code-review-checklist.md) for everything lint cannot judge.

## Topic docs

| Topic                                         | Doc                                                         |
| --------------------------------------------- | ----------------------------------------------------------- |
| Feature folder structure and layer boundaries | [Feature code organization](./feature-code-organization.md) |
| API client, React Query, feature `api/`       | [API](./api.md)                                             |
| Forms (React Hook Form + Zod)                 | [Forms](./forms.md)                                         |
| Component / hook tests (Jest + RNTL)          | [Testing](./testing.md)                                     |
| E2E tests (Maestro)                           | [E2E](./e2e.md)                                             |
| PR review judgments                           | [Code review checklist](./code-review-checklist.md)         |

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
│ 3. Topic conventions (as needed)                                │
│    Feature structure, API, forms, testing, E2E                  │
│    → feature-code-organization.md, api.md, forms.md,            │
│      testing.md, e2e.md                                         │
├─────────────────────────────────────────────────────────────────┤
│ 4. Code review (human judgment)                                 │
│    Identifier naming quality, whether a screen is thin enough   │
│    → code-review-checklist.md                                   │
└─────────────────────────────────────────────────────────────────┘
```

Higher layers inherit lower layers. Feature code must follow codebase conventions **and** the topic docs that apply to the work.

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

### File and folder names

Use **kebab-case** for source file and folder names under linted app directories. Export identifiers stay PascalCase (components, screens) or camelCase (hooks, helpers).

Keep component (and hook/screen) files **flat** under their layer folder. Do not wrap a file in a same-named directory (`button/button.tsx` or `Button/Button.tsx`) or ship an `index.tsx` as the component entry.

| Kind        | File name                        | Export                        |
| ----------- | -------------------------------- | ----------------------------- |
| Screen      | `profile-screen.tsx`             | `ProfileScreen` (default)     |
| Component   | `edit-profile-modal.tsx`         | `EditProfileModal` (named)    |
| Hook        | `use-profile-screen.ts`          | `useProfileScreen` (named)    |
| Test        | `use-edit-profile-form.test.tsx` | (mirrors the unit under test) |
| Shared util | `axios-instance.ts`              | camelCase named exports       |

```ts
// Preferred
components / ui / button.tsx;
features / profile / components / edit - profile - modal.tsx;

// Avoid
components / ui / button / button.tsx;
components / ui / Button / Button.tsx;
components / ui / button / index.tsx;
```

Expo Router keeps its own path conventions in `app/`: `_layout.tsx`, `[id].tsx`, and route groups like `(tabs)/`. Those are allowed; do not rename them to force kebab-case. The flat-file rule does not apply under `app/`.

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

Full API error patterns: [API](./api.md#error-handling).

### ESLint (global)

| Rule                        | What it enforces                                |
| --------------------------- | ----------------------------------------------- |
| `func-style`                | No `function` declarations; use `const` + arrow |
| `prefer-arrow-callback`     | Arrow callbacks in `.map`, `.then`, etc.        |
| `no-restricted-syntax`      | No `function` expressions; use arrows           |
| `no-var`                    | `var` is forbidden                              |
| `prefer-const`              | Use `const` when a binding is never reassigned  |
| `local/kebab-case-filename` | Kebab-case filenames                            |
| `local/no-component-folder` | No same-named / `index` component folders       |

## 2. Area conventions

### `app/`: Expo Router routes

- Routes are thin entry points. Re-export feature screens; do not embed feature business logic.
- Layout files, param parsing, and navigation guards may live here.
- Prefer the profile route pattern:

```ts
export { default } from "@/features/profile/screens/profile-screen";
```

ESLint blocks imports of feature `hooks/`, `components/`, and `api/` (legacy `app/events/**` is exempt until refactor).

### `components/`: shared UI

- Reusable primitives used across features (`@/components/ui/`).
- Prefer named exports for shared components.
- Compose primitives instead of duplicating button, input, or text patterns.
- No feature-specific business logic.

### `context/`: app-wide React context

- Global state providers (`AuthProvider`, etc.).
- Must not import from `@/features/*` (enforced by ESLint).

### `hooks/`: app-wide hooks

- Cross-feature hooks (for example, `useColorScheme`).
- Feature screen hooks belong in `features/<name>/hooks/`, not here.

### `lib/`: shared utilities and API client

Shared client layout, envelope unwrapping, and React Query defaults: [API](./api.md).

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

Lint covers filename case and many structure rules. It cannot cover identifier naming quality, whether a mutation invalidates the right keys, or how thin a screen really is. Use the [code review checklist](./code-review-checklist.md) during PR review.

## Quick reference

| I am writing…              | Follow                                                      |
| -------------------------- | ----------------------------------------------------------- |
| Any TS/TSX file            | Codebase conventions (this doc)                             |
| A route in `app/`          | Area: `app/` + codebase                                     |
| Shared UI in `components/` | Area: `components/` + codebase                              |
| A new feature              | [Feature code organization](./feature-code-organization.md) |
| Feature API / React Query  | [API](./api.md)                                             |
| A form                     | [Forms](./forms.md)                                         |
| Component / hook tests     | [Testing](./testing.md)                                     |
| Mobile E2E / Maestro       | [E2E](./e2e.md)                                             |
| Reviewing a PR             | Checklist + `npm run lint`                                  |

## Migrating legacy code

When refactoring `events`, gallery, or other pre-profile code:

1. Match `features/profile/` structure and patterns.
2. Convert `function` declarations to arrow `const` bindings.
3. Keep file and folder names kebab-case (`local/kebab-case-filename`), and keep component files flat (`local/no-component-folder`).
4. Remove the relevant ESLint legacy exemptions in the same PR.
