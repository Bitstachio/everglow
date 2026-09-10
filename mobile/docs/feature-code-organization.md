# Feature Code Organization

This document describes **feature folder structure and layer boundaries** in the Everglow mobile app: what lives where, what each layer may do, and how routes wire in.

It does not define how to call the API, build forms, or write TypeScript style. Those have their own docs.

**Convention hierarchy:** Feature modules follow [codebase conventions](./code-conventions.md) plus the structural rules in this document.

**Reference implementation:** `features/profile/` is the only feature module that follows this structure today. Copy that layout when building new features.

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
│   └── profile-screen.tsx
├── hooks/
│   ├── use-profile-screen.ts
│   ├── use-edit-profile-form.ts
│   └── use-edit-profile-form.test.tsx
├── components/
│   └── edit-profile-modal.tsx
├── api/
│   ├── keys.ts
│   └── mutations.ts
└── types.ts
```

Form conventions (React Hook Form + Zod): [Forms](./forms.md).

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

- Own local UI state (modals, toggles, loading flags)
- Call feature API hooks from `api/`
- Read app-wide state from `@/context` when needed (for example, `useAuth`)
- Handle user actions (confirm dialogs, navigation triggers, orchestration)
- Return everything the screen needs as a flat object

Export hooks as named exports. Additional named hooks for the same feature (for example, a form hook) also live in `hooks/`.

**Example:** `useProfileScreen` manages the edit modal and delete/logout flows. Profile edit submit lives in `useEditProfileForm` (see [Forms](./forms.md)).

### `components/`

Feature-specific UI pieces used by one or more screens in the same feature. A component should:

- Be mostly presentational: receive data and callbacks via props
- Not call the API directly
- Use shared primitives from `@/components/ui` where possible
- Export as named exports

Place a component in `components/` when it is specific to this feature. Place it in `@/components/` when it is reused across multiple features.

**Example:** `EditProfileModal` receives its data and handlers from the screen hook via props.

### `api/`

All server communication for the feature lives here. Typical files: `keys.ts`, `queries.ts`, `mutations.ts`. Conventions for those files are in [API](./api.md).

### `types.ts`

Re-export only the types the feature needs from `@/lib/api/generated`. Do not duplicate DTO definitions.

Add feature-local types (UI enums, props shared across files) in the hook or component file that owns them, unless multiple files in the feature need the same type.

### `utils.ts` (optional)

Pure helper functions with no React or API dependencies. Add only when logic is shared across multiple files in the feature.

## Routing (`app/`)

Expo Router files in `app/` are thin entry points. They should re-export the feature screen, not contain feature logic.

```ts
// app/(tabs)/profile.tsx
export { default } from "@/features/profile/screens/profile-screen";
```

Route-specific params, layouts, and navigation guards can live in `app/`, but screens and business logic belong in `features/`.

## Data flow

```
app/(tabs)/profile.tsx
        │
        ▼
screens/profile-screen.tsx          ← layout + composition
        │
        ├── hooks/use-profile-screen.ts      ← modal state, screen actions
        │         │
        │         ├── hooks/use-edit-profile-form.ts  ← RHF + submit
        │         ├── api/mutations.ts                ← useMutation hooks
        │         ├── context/auth                    ← app-wide user state
        │         └── lib/api/errors                  ← user-facing error messages
        │
        └── components/edit-profile-modal.tsx   ← presentational UI (`control`)
```

## Shared folders outside `features/`

| Location         | Role                                                       |
| ---------------- | ---------------------------------------------------------- |
| `components/ui/` | Reusable primitives (`Button`, `Input`, …). Compose these. |
| `hooks/`         | Cross-feature hooks (for example, `useColorScheme`)        |
| `context/`       | Global state (for example, `AuthProvider` / `useAuth`)     |
| `lib/`           | Shared utilities and the API client                        |
| `providers/`     | App-level providers wired in `app/_layout.tsx`             |

Feature hooks may depend on app-wide context. Avoid the reverse: context should not import from `features/`.

## Naming

File and folder names are kebab-case. Export identifiers keep React conventions (PascalCase components/screens, camelCase hooks). See [Code conventions: File and folder names](./code-conventions.md#file-and-folder-names).

| Item           | File / folder              | Export / symbol            |
| -------------- | -------------------------- | -------------------------- |
| Feature folder | `profile`, `event-invites` | —                          |
| Screen file    | `profile-screen.tsx`       | `ProfileScreen` (default)  |
| Screen hook    | `use-profile-screen.ts`    | `useProfileScreen` (named) |
| Component file | `edit-profile-modal.tsx`   | `EditProfileModal` (named) |

## Imports

Use the `@/` path alias for cross-folder imports. Use relative imports only for files within the same feature (for example, `../api/mutations`). See [Code conventions: Imports](./code-conventions.md#imports).

## Exports

- Screens: default export
- Hooks, components, API hooks, keys: named exports

## Adding a new feature

1. Create `features/<name>/` with `screens/`, `hooks/`, `components/`, and `api/` as needed
2. Add `types.ts` with re-exports from `@/lib/api/generated`
3. Implement `use<Screen>Screen` hook with state and handlers
4. Build the screen as a thin composition layer
5. Wire the route in `app/` as a one-line re-export

## ESLint enforcement

`mobile/eslint.config.js` layers rules on top of each other. Run `npm run lint` locally and in CI to catch violations early. The script runs ESLint across all app source folders (not only `app/` and `components/`). See [Code conventions](./code-conventions.md) for the full hierarchy.

### Codebase rules (all linted source)

| Rule                        | Scope                                                                                        | What it enforces                           |
| --------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Arrow functions             | `app/`, `components/`, `context/`, `features/`, `hooks/`, `lib/`, `providers/`, `constants/` | No `function` declarations or expressions  |
| `no-var` / `prefer-const`   | Same                                                                                         | `let`/`const` only; prefer `const`         |
| `local/kebab-case-filename` | Same                                                                                         | Kebab-case filenames                       |
| `local/no-component-folder` | Same (skips `app/`)                                                                          | No same-named or `index` component folders |

### Feature rules (additional)

| Rule                      | Scope                                    | What it enforces                                                                      |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Feature self-imports      | `features/<name>/**`                     | Import files inside the same feature with relative paths, not `@/features/<name>/...` |
| Presentational components | `features/**/components/**`              | No `api/`, hooks, React Query, or generated SDK imports; named exports only           |
| Thin screens              | `features/**/screens/**`                 | No `api/`, React Query, generated SDK, or `Alert` imports (use a screen hook)         |
| Screen hooks              | `features/**/hooks/**`                   | No generated SDK, screens, or components; named exports only                          |
| API hooks                 | `features/**/api/**`                     | Named exports only                                                                    |
| Context boundary          | `context/**`                             | No imports from `@/features/*`                                                        |
| Thin app routes           | `app/**` (except legacy `app/events/**`) | Routes may import feature screens only, not hooks, components, or `api/`              |

Layer rules target the profile pattern (`components/`, screen hooks, thin routes). Legacy exemptions exist only so old code keeps passing lint until refactor:

| Legacy path                    | ESLint exemption                                                    |
| ------------------------------ | ------------------------------------------------------------------- |
| `features/events/**` screens   | Thin-screen rules (listed in `legacyFeatureNames`)                  |
| `app/events/**`                | Thin-route rules                                                    |
| `features/events/component/**` | Not covered by `components/` rules (wrong folder name; do not copy) |

Photos/gallery has no `features/` module yet and is not part of this structure.

### Not enforced by ESLint

Lint cannot cover identifier naming quality or how thin a screen really is. Use the [code review checklist](./code-review-checklist.md) during review for everything ESLint misses.

## Migrating legacy code

When refactoring `events`, gallery, or other pre-profile code, match `features/profile/` and remove the relevant ESLint exemptions (`legacyFeatureNames`, `legacyAppRoutePaths`) in the same PR.
