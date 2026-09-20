# Testing

This document covers **component and hook tests** in the Everglow mobile app (Jest + React Native Testing Library). Device E2E flows are separate: [E2E (Maestro)](./e2e.md).

**Convention hierarchy:** Tests follow [codebase conventions](./code-conventions.md). Form-specific patterns (probes, `.tsx` harnesses) are in [Forms](./forms.md#testing).

## Stack

| Tool                                   | Role                                             |
| -------------------------------------- | ------------------------------------------------ |
| Jest (`pnpm test`)                     | Unit and component test runner                   |
| `@testing-library/react-native` (RNTL) | Render, query, and interact with React Native UI |

Place `*.test.ts` / `*.test.tsx` next to the file under test (for example, `edit-profile-modal.test.tsx` beside `edit-profile-modal.tsx`).

## React Native Testing Library

This project uses `@testing-library/react-native`. Its APIs and testing conventions can differ from training data (including older RNTL or web Testing Library habits).

Before writing or changing RNTL tests, read the package guides under `node_modules/@testing-library/react-native/docs/`, starting with:

`node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`

Prefer those docs over stale assumptions, and follow deprecation notices.

## Scripts

```sh
pnpm test              # run once
pnpm test:watch        # watch mode
pnpm test:coverage     # coverage report
```

For Maestro device tests, see [E2E](./e2e.md).

## Events page

Run the Events tab's component, hook, API, and screen integration tests from `mobile/`:

```sh
pnpm test --runInBand features/events
pnpm test --runInBand features/events/screens/events-screen-integration.test.tsx
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
