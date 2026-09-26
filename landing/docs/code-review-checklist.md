# Landing Code Review Checklist

ESLint catches arrow functions, `let`/`const`, kebab-case filenames, and named exports in `components/`, `hooks/`, and `lib/`. Use this checklist for anything lint cannot judge.

See also [Code conventions](./code-conventions.md) and `landing/eslint.config.mjs`.

## Codebase conventions

- [ ] Arrow functions (`const fn = () => {}`), not `function` keyword
- [ ] `const` by default; `let` only when reassigned; no `var`
- [ ] Cross-folder imports use `@/` alias
- [ ] Styling uses Tailwind `className` and tokens from `src/app/globals.css`

## Naming and layout

- [ ] Files and folders use kebab-case (`local/kebab-case-filename`)
- [ ] Component/hook files stay flat by default; same-named folders only when colocating a private hook/util (not just a test). No `index.tsx` component entries (`local/no-component-folder`)
- [ ] Non-trivial component logic is extracted to a hook
- [ ] Component-private hooks colocate in a same-named folder; shared hooks go in `src/hooks/`
- [ ] Export identifiers match their role (PascalCase components, camelCase hooks); file names are kebab-case

## Exports

- [ ] App Router files (`page.tsx`, `layout.tsx`) use a **default export**
- [ ] Shared components, hooks, and `lib/` helpers use **named exports**
- [ ] `middleware.ts` and `src/i18n/request.ts` keep the default export next-intl/Next require

## Pages (`src/app/`)

- [ ] `page.tsx` is mostly composition: sections and shared UI
- [ ] Large section markup lives in `src/components/sections/`, not in the route file
- [ ] Locale and metadata stay in the route/layout, not in a section

## Components

- [ ] Shared primitives live in `src/components/ui/`
- [ ] Page sections live in `src/components/sections/`
- [ ] No new `index.ts` barrels under `components/`
