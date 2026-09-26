# Landing Code Conventions

How we write TypeScript and React in the Everglow marketing site (`landing/`). These match the mobile app's TypeScript and React conventions (arrow functions, kebab-case files, presentational components). They do **not** copy React Native, Expo Router, or feature-module docs — this is Next.js with static export.

**Enforcement:** `landing/eslint.config.mjs`. Run `pnpm lint` before opening a PR. Use the [code review checklist](./code-review-checklist.md) for what lint cannot judge.

## Convention hierarchy

```
1. Codebase conventions (all app TS/TSX)
   Arrow functions, let/const, kebab-case files, @/ imports
2. Area conventions (folder-specific)
   src/app/ routes, src/components/, src/hooks/, src/lib/, src/i18n/
3. Code review (human judgment)
   Identifier naming, whether a page is thin enough
```

## 1. Codebase conventions

These apply to every `.ts` and `.tsx` file under `src/` and to `middleware.ts`.

### Functions

Use arrow functions instead of the `function` keyword. Assign components, hooks, handlers, and helpers to `const` bindings.

```ts
// Preferred
export const Hero = () => { ... };
export const useMediaQuery = () => { ... };
const handleClick = () => { ... };
items.map((item) => item.id);

// Avoid
export function Hero() { ... }
const handleClick = function () { ... };
items.map(function (item) { return item.id; });
```

Next.js route files (`page.tsx`, `layout.tsx`) default-export a `const` component:

```ts
const HomePage = () => { ... };
export default HomePage;
```

`src/i18n/request.ts` and `middleware.ts` keep a default export because next-intl and Next.js require it.

### Variables

- Use `const` by default.
- Use `let` only when a binding is reassigned.
- Never use `var`.

### File and folder names

Use **kebab-case** for source file and folder names. Export identifiers stay PascalCase (components) or camelCase (hooks, helpers).

Keep component (and hook) files **flat** under their layer folder by default. Do not ship an `index.tsx` as the component entry.

### Component logic and hooks

Components stay mostly presentational. Do **not** grow sophisticated logic in the component body. Extract that into a hook first:

| Logic ownership                                    | Where it lives         | Layout                                                                           |
| -------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Tied to one component (private presentation/state) | Next to that component | Same-named folder: `component-name/component-name.tsx` + `use-component-name.ts` |
| Reused across unrelated UI surfaces                | `src/hooks/`           | Flat file (e.g. `hooks/use-media-query.ts`)                                      |

A folder that only wraps the component and its test must stay flat (`local/no-component-folder`). Use a same-named folder when colocating a private hook, util, or subcomponent.

| Kind      | File name                | Export                         |
| --------- | ------------------------ | ------------------------------ |
| Page      | `src/app/.../page.tsx`   | default (`HomePage`)           |
| Layout    | `src/app/.../layout.tsx` | default (`RootLayout`)         |
| Component | `hero.tsx`               | `Hero` (named)                 |
| Hook      | `use-hero.ts`            | `useHero` (named)              |
| Test      | `hero.test.tsx`          | (mirrors the unit under test)  |
| Shared util | `cn.ts`                | camelCase named exports        |

```ts
// Preferred — flat when the component is self-contained
src/components/ui/button.tsx
src/components/sections/hero.tsx

// Preferred — extract private logic into a colocated hook
src/components/ui/language-switcher/language-switcher.tsx
src/components/ui/language-switcher/use-language-switcher.ts

// Avoid
src/components/ui/button/button.tsx   // only the component — keep flat
src/components/ui/Button/Button.tsx
src/components/ui/button/index.tsx
```

Next.js App Router keeps its own path conventions in `src/app/`: `page.tsx`, `layout.tsx`, `not-found.tsx`, `[locale]/`, and route groups like `(marketing)/`. Those are allowed; do not rename them to force a different scheme. The flat-file rule does not apply under `src/app/`.

### Imports

Use the `@/` path alias for cross-folder imports (`@/` maps to `src/`):

```ts
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/sections/hero";
import { cn } from "@/lib/cn";
```

Import the component file directly (no `index` barrel).

### Styling

Use Tailwind `className` and the tokens in `src/app/globals.css` (`bg-background`, `text-strong`, `text-accent`, …). Do not introduce a second styling system.

### ESLint (global)

| Rule                        | What it enforces                                                               |
| --------------------------- | ------------------------------------------------------------------------------ |
| `func-style`                | No `function` declarations; use `const` + arrow                                |
| `prefer-arrow-callback`     | Arrow callbacks in `.map`, `.then`, etc.                                       |
| `no-restricted-syntax`      | No `function` expressions; use arrows                                          |
| `no-var`                    | `var` is forbidden                                                             |
| `prefer-const`              | Use `const` when a binding is never reassigned                                 |
| `local/kebab-case-filename` | Kebab-case filenames                                                           |
| `local/no-component-folder` | No `index` entries; no same-named folders that only wrap a component (+ tests) |

Named exports are required under `src/components/`, `src/hooks/`, and `src/lib/`. Default exports stay on App Router files, `middleware.ts`, and `src/i18n/request.ts`.

## 2. Area conventions

```
landing/src/
├── app/                 # Next.js App Router (thin routes)
├── components/
│   ├── ui/              # Shared primitives (button, etc.)
│   └── sections/        # Page sections (hero, features, footer)
├── hooks/               # App-wide hooks
├── lib/                 # Shared utilities
├── i18n/                # next-intl routing and request config
└── messages/            # Translation JSON per locale
```

This site is a static marketing page. There is no `features/` tree, no API client, and no React Query. Do not import those patterns from `mobile/`.

### `src/app/`: Next.js routes

- Routes are thin entry points: compose sections and shared UI, set metadata, call `setRequestLocale`.
- Do not grow large JSX trees in `page.tsx`. Extract sections into `src/components/sections/`.
- Layout files, locale handling, and metadata may live here.

### `src/components/`: UI

- `ui/` — reusable primitives used in more than one section.
- `sections/` — one section of the landing page (hero, features, footer).
- Prefer named exports.
- No business logic that belongs in a hook.
- Keep bodies presentational; extract non-trivial UI logic into a colocated or shared hook.

### `src/hooks/`: app-wide hooks

- Cross-section hooks (for example, `useMediaQuery`).
- Hooks private to one component belong next to that component (same-named folder), not here.

### `src/lib/`: shared utilities

- Pure helpers (`cn`, date/format helpers). Named exports only.

### `src/i18n/` and `src/messages/`

- next-intl wiring stays in `src/i18n/`.
- Copy lives in `src/messages/<locale>/`. Add a locale by adding a folder and registering it in `src/i18n/config.ts`.
- `messages/<locale>/index.ts` is the locale barrel next-intl loads. Do not add `index.ts` barrels under `components/`.

## Quick reference

| I am writing…                    | Follow                                      |
| -------------------------------- | ------------------------------------------- |
| Any TS/TSX file                  | Codebase conventions (this doc)             |
| A route in `src/app/`            | Area: `src/app/` + codebase                 |
| Shared UI in `src/components/ui` | Area: `components/` + codebase              |
| A page section                   | `src/components/sections/` + codebase       |
| A translation string             | `src/messages/<locale>/`                    |
| Reviewing a PR                   | Checklist + `pnpm lint`                     |
