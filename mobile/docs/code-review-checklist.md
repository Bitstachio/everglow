# Mobile Code Review Checklist

ESLint catches codebase conventions (arrow functions, `let`/`const`) and feature import boundaries. It cannot judge naming, API usage patterns, or whether a screen is "thin enough." Use this checklist during code review for anything ESLint does not cover.

**Reference:** `features/profile/` is the model for all new feature work. `features/events/` and photos/gallery code are legacy; review new PRs against profile, not those areas.

See also:

- [Code conventions](./code-conventions.md) — convention hierarchy and codebase-wide rules
- [Feature code organization](./feature-code-organization.md) — feature structure and data flow
- `mobile/eslint.config.js` — what lint enforces automatically

## Codebase conventions

ESLint enforces these globally. Still verify in review:

- [ ] Arrow functions (`const fn = () => {}`), not `function` keyword
- [ ] `const` by default; `let` only when reassigned; no `var`
- [ ] Cross-folder imports use `@/` alias
- [ ] UI errors use `getErrorMessage`, not raw Axios shapes

## Feature structure

- [ ] New work follows the profile feature layout: `screens/`, `hooks/`, `components/`, `api/`, and `types.ts`
- [ ] Feature folder name is kebab-case or a single lowercase word (`profile`, `event-invites`)
- [ ] Screen files live in `screens/` and end with `Screen.tsx` (`ProfileScreen.tsx`)
- [ ] Feature-specific UI lives in `components/`, not in `@/components/`
- [ ] Shared UI that multiple features need lives in `@/components/ui/`, not inside a feature
- [ ] Pure helpers shared across the feature belong in `utils.ts`, not duplicated in hooks or screens
- [ ] Legacy `component/` folders are not introduced in new features (use `components/`)

## Naming

- [ ] Screen hook is named `use<ScreenName>` and lives in `hooks/` (`useProfileScreen`)
- [ ] Query key factory is named `<feature>Keys` and lives in `api/keys.ts` (`profileKeys`)
- [ ] Mutation hooks follow `use<Action><Entity>Mutation` (`useUpdateProfileMutation`)
- [ ] File names match their primary export (PascalCase for components and screens, camelCase for hooks)

## Functions

Covered by global ESLint rules. No extra checklist items unless fixing legacy code.

## Exports

ESLint enforces named exports in hooks, components, and `api/`. Screens are the exception.

- [ ] Screens use a **default export**
- [ ] Hooks, components, API hooks, and key factories use **named exports**
- [ ] App route files re-export the screen default, not a named screen export

## Screens (`features/**/screens/`)

ESLint blocks direct `api/`, SDK, React Query, and `Alert` imports. Still check:

- [ ] Screen delegates state, handlers, and side effects to a screen hook
- [ ] Screen is mostly layout and composition: shared UI, feature components, styles
- [ ] No inline business logic (payload building, conditional API calls, confirm flows)
- [ ] No navigation side effects beyond what the hook exposes as handlers
- [ ] No `useEffect` chains that fetch data or run mutations (belongs in hook or `api/`)

## Screen hooks (`features/**/hooks/`)

- [ ] One hook per screen, returning a flat object of values and handlers
- [ ] Local UI state (modals, form fields, toggles) lives here
- [ ] Calls feature `api/` hooks for queries and mutations, not the generated SDK
- [ ] Reads app-wide state from `@/context` when needed (`useAuth`), not by duplicating fetches
- [ ] User confirmations (`Alert.alert`) and mutation `onError` / `onSuccess` UI feedback live here
- [ ] Imports types from `../types`, not from `@/lib/api/generated`

## Components (`features/**/components/`)

ESLint blocks `api/`, hooks, React Query, and SDK imports. Still check:

- [ ] Component is presentational: data and callbacks come from props
- [ ] No `useEffect` that fetches or mutates data
- [ ] No calls into `@/lib/event`, `@/lib/photo`, or other service modules (wrap in `api/` first)
- [ ] Composes `@/components/ui` primitives instead of reimplementing buttons, inputs, etc.
- [ ] Feature-local types used only in one file stay in that file; shared types move to `types.ts` or a shared types module

## API layer (`features/**/api/`)

- [ ] Server calls for the feature live here, split across `keys.ts`, `queries.ts`, and/or `mutations.ts`
- [ ] Generated SDK calls use `throwOnError: true`
- [ ] Responses are unwrapped with `unwrapEnvelope` before returning from `mutationFn` / `queryFn`
- [ ] Mutations update or invalidate cache through the feature key factory (`profileKeys.me()`, `profileKeys.all`)
- [ ] Auth-sensitive updates also sync app context when appropriate (`updateUser` after profile update)
- [ ] `queries.ts` is added when the feature owns fetch lifecycle; context or props are used when data is already available elsewhere
- [ ] Generated `*Options` and query key helpers from `@/lib/api/generated/@tanstack/react-query.gen` are preferred over hand-rolled keys

## Types (`features/**/types.ts`)

- [ ] DTOs are re-exported from `@/lib/api/generated`, not copied or redefined
- [ ] Only types the feature actually uses are exported
- [ ] Form shapes and UI-only types live in the owning hook or component unless shared across the feature

## App routes (`app/`)

ESLint blocks imports of feature hooks, components, and `api/` (except legacy `app/events/**`). Still check:

- [ ] Route file is a thin entry point, ideally a one-line re-export:

```ts
export { default } from "@/features/profile/screens/ProfileScreen";
```

- [ ] Layout, param parsing, and navigation guards are the only logic that stays in `app/`
- [ ] No feature business logic, forms, or data fetching in route files

## Error handling

- [ ] UI-facing mutation errors use `getErrorMessage(error, "Fallback message")`, not `error.response?.data` or raw `error.message`
- [ ] API errors are normalized by the Axios interceptor (`toApiError`); feature code does not re-parse Axios shapes in screens

## Imports

ESLint enforces relative imports inside a feature and blocks some cross-layer imports. Still check:

- [ ] Cross-feature imports use `@/features/<other-feature>/...` and are intentional (prefer shared `lib/` or `@/components/` when coupling is not needed)
- [ ] App-wide imports use the `@/` alias (`@/components/ui`, `@/context`, `@/lib`)
- [ ] `context/` does not import from `@/features/*` (enforced by lint, but worth confirming in review)

## React Query and cache

- [ ] `keys.ts` defines an `all` root key for broad invalidation
- [ ] Specific queries have named key functions on the factory object
- [ ] After mutations, cache is updated with `setQueryData` or invalidated with `invalidateQueries` using keys from `keys.ts`
- [ ] Query hooks use consistent `staleTime` / refetch behavior; do not override defaults without a reason

## Shared infrastructure

- [ ] No hand-edits under `lib/api/generated/` (regenerate with `npm run openapi:generate`)
- [ ] New endpoints are consumed through feature `api/` wrappers, not ad hoc Axios calls
- [ ] Global hooks stay in `hooks/`; feature hooks stay in `features/<name>/hooks/`

## Legacy code (events, photos/gallery)

Legacy areas are exempt from some ESLint rules so existing code keeps passing. They are not references for new work.

- [ ] New features match `features/profile/`, not `features/events/` or gallery/`lib/photo` patterns
- [ ] New code does not introduce `component/` folders, screen logic, or direct `lib/event` / `lib/photo` calls from UI layers
- [ ] Legacy refactors move toward the profile pattern and remove ESLint exemptions in the same PR

## Quick review flow

1. Run `npm run lint` and fix automated violations first.
2. Confirm the feature folder layout and naming match the profile reference.
3. Trace data flow: route → screen → hook → `api/` → generated SDK.
4. Check mutations for `throwOnError`, `unwrapEnvelope`, cache updates, and `getErrorMessage`.
5. Skim screens and components for logic that slipped past import rules (effects, service calls, inline fetches).
