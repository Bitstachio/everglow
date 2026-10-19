# Testing

This document covers **unit/component** and **screen-integration** tests in the Everglow mobile app (Jest + React Native Testing Library). Device E2E flows are separate: [E2E (Maestro)](./e2e.md).

**Convention hierarchy:** Tests follow [codebase conventions](./code-conventions.md). Form-specific patterns (probes, `.tsx` harnesses) are in [Forms](./forms.md#testing).

## Layers at a glance

| Layer              | Where                                 | Naming                     | Runner                  | Timeout / workers                        |
| ------------------ | ------------------------------------- | -------------------------- | ----------------------- | ---------------------------------------- |
| Unit / component   | Colocated next to the file under test | `*.test.ts` / `*.test.tsx` | `pnpm test`             | Jest default 5s; parallel workers        |
| Screen integration | Colocated next to the screen          | `*.integration.test.tsx`   | `pnpm test:integration` | 15s; `maxWorkers: 2`                     |
| E2E (Maestro)      | `.maestro/`                           | Maestro flows              | `pnpm test:e2e`         | Device / simulator — see [E2E](./e2e.md) |

Filename is the gate: future screen-integration suites must be named `*.integration.test.tsx` so `pnpm test` ignores them and `pnpm test:integration` picks them up. Do not use the API’s `*.integration.spec.ts` naming here.

Form-hook probes (`use-*-form.test.tsx`) are shallow RHF unit tests and stay under `pnpm test`.

## Stack

| Tool                                   | Role                                             |
| -------------------------------------- | ------------------------------------------------ |
| Jest (`pnpm test`)                     | Unit and component test runner                   |
| Jest (`pnpm test:integration`)         | Screen-integration suites                        |
| `@testing-library/react-native` (RNTL) | Render, query, and interact with React Native UI |

Place `*.test.ts` / `*.test.tsx` next to the file under test (for example, `edit-profile-modal.test.tsx` beside `edit-profile-modal.tsx`). Screen-integration files sit beside the screen they mount (for example, `events-screen.integration.test.tsx` beside `events-screen.tsx`).

## React Native Testing Library

This project uses `@testing-library/react-native`. Its APIs and testing conventions can differ from training data (including older RNTL or web Testing Library habits).

Before writing or changing RNTL tests, read the package guides under `node_modules/@testing-library/react-native/docs/`, starting with:

`node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`

Prefer those docs over stale assumptions, and follow deprecation notices.

Prefer `userEvent.paste` over `userEvent.type` when filling inputs for value-based assertions (submit, trim, validation, retry). Keep `press` as-is. `--runInBand` remains the debug path for worker contention.

Components that call `useTranslation` must render under the app i18n instance. Prefer
[`testing/render.tsx`](../testing/render.tsx) (`renderWithI18n`) over bare `render`. Shared
UI defaults that call `i18n.t` on the singleton do not need a provider. See [i18n](./i18n.md).

## Scripts

```sh
pnpm test              # unit / component (default 5s timeout)
pnpm test:watch        # unit watch mode
pnpm test:coverage     # unit + coverage
pnpm test:integration  # screen-integration only (15s, maxWorkers: 2)
```

CI runs `pnpm test --maxWorkers=2 --coverage`, then `pnpm test:integration --coverage`, and posts one sticky "Mobile test coverage" comment on the PR with a column per suite. See `.github/workflows/ci.yml`. Maestro is not in CI.

Both suites measure the same files, set once in `jest.coverage.js`: the app's own source under `app`, `components`, `constants`, `context`, `features`, `hooks`, `i18n`, `lib`, `locales`, `providers` and `theme`, excluding tests, `testing/` fixtures and the generated API client. Reports land in `coverage/unit` and `coverage/integration`.

Unit hang detection stays at Jest’s default 5s (`jest.config.js`). Screen-integration uses 15s in `jest.integration.config.js`. If a unit test times out under load, re-run with `--runInBand` rather than raising the unit timeout:

```sh
pnpm test --runInBand
pnpm test:integration --runInBand
```

For Maestro device tests, see [E2E](./e2e.md).

## Events page

Run the Events unit/component suites and the screen-integration suite from `mobile/`:

```sh
pnpm test -- features/events
pnpm test:integration -- features/events/screens/events-screen.integration.test.tsx
```

The screen integration suite renders the real `EventsScreen`, child components, form hooks,
validation, and React Query provider. It replaces the generated SDK calls and native boundaries
(camera, QR rendering, clipboard/share/alerts, safe-area insets, and navigation). These tests do
not require an API server or device and do not verify HTTP transport or native camera rendering.

Coverage includes loading/empty/populated states, link and QR joining, validation and retries,
pending-submission guards, modal reset, creator-only sharing, navigation, refresh and focus
refetching, fetch failures, and account-specific caches. API hook tests additionally verify
cancellation, envelope handling, and successful/failed mutation cache invalidation.

`testing/native-mocks.tsx` keeps feature components real. Its refresh-control mock preserves props
because React Native's default Jest mock discards them; native refresh and barcode events use
`fireEvent`, while ordinary interactions use `userEvent`.

Create and detail routes are separate from this page; this suite tests navigation to those routes.
Device E2E coverage remains a separate follow-up.

## New roll (chapter 04)

Run the new-roll unit and screen-integration suites from `mobile/`:

```sh
pnpm test -- features/events/lib/new-roll features/events/hooks/use-new-roll features/events/api features/events/components/roll-envelope
pnpm test:integration -- features/events/screens/new-roll-screen.integration.test.tsx features/events/screens/roll-loaded-screen.integration.test.tsx
```

The integration suite renders the real screen, form, hooks and React Query, with the film on offer
from a mocked `GET /users/me/limits`. Only the generated SDK, navigation and the keyboard's show and
hide events are replaced, and only `Date` is faked, so labels such as "Tonight · 20:00" are stable.
It covers the default time and film, picking a day and a time in the slip, the days the API allows,
lengths without a name, the guest line, a failed create, and limits that fail to load. The first
frame goes through the photo picker, the on-device crop and the byte upload, which are mocked at
their native boundaries; the suite checks the cover is minted and confirmed for the new roll, and
that the roll still loads when the cover doesn't take. The Loaded suite renders the envelope from
the cache the create fills, and checks where Send the envelope, Go to the roll and Close lead.

Leaving is asked about through React Navigation's `usePreventRemove`, which the suite replaces so a
test can play the moment the screen is about to go: an empty roll goes at once, one with a name or
a first frame shows the "Throw this roll away?" slip, and a loaded roll goes without asking. The
rolls-in-use screen (04.8) shows instead of the form when `GET /users/me/limits` says every roll
the plan allows is running, and after a create refused with `ACTIVE_EVENT_LIMIT_REACHED`.

The form-hook probe covers the payload (trimming, the optional line, the plan's default film, and a
plan that never closes), validation, and retrying after a failure. Date helpers have their own unit
tests in `features/events/lib/new-roll.test.ts`.
