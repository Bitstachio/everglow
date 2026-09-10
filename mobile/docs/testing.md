# Testing

This document covers **component and hook tests** in the Everglow mobile app (Jest + React Native Testing Library). Device E2E flows are separate: [E2E (Maestro)](./e2e.md).

**Convention hierarchy:** Tests follow [codebase conventions](./code-conventions.md). Form-specific patterns (probes, `.tsx` harnesses) are in [Forms](./forms.md#testing).

## Stack

| Tool | Role |
| ---- | ---- |
| Jest (`pnpm test`) | Unit and component test runner |
| `@testing-library/react-native` (RNTL) | Render, query, and interact with React Native UI |

Place `*.test.ts` / `*.test.tsx` next to the file under test (for example, `EditProfileModal.test.tsx` beside `EditProfileModal.tsx`).

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
