# Testing

This document covers **unit** and **integration** tests for the Everglow API (Jest + Nest Testing + Supertest). True end-to-end tests against real dependencies are planned; they are not in the tree yet (see [Future: E2E](#future-e2e)).

## Layers at a glance

| Layer           | Where                              | Naming                     | What it exercises                                      | External deps                          |
| --------------- | ---------------------------------- | -------------------------- | ------------------------------------------------------ | -------------------------------------- |
| Unit            | Colocated under `src/`             | `*.spec.ts`                | One class or pure function                             | Mocked (Prisma, S3, logger, …)         |
| Integration     | `test/integration/`                | `*.integration.spec.ts`    | Full Nest app over HTTP (routing, pipes, guards, CASL) | Prisma/Auth/S3 still mocked            |
| E2E (planned)   | TBD under `test/`                  | TBD                        | Critical workflows only                                | Real services — **no mocks**           |

```sh
npm test                 # unit (src/**/*.spec.ts)
npm run test:cov         # unit + coverage
npm run test:integration # integration suite
```

CI runs `test:cov`, then `test:integration`, then build. See `.github/workflows/ci.yml`.

---

## Unit tests

**Location:** next to the code under test, e.g. `src/users/users.service.spec.ts` beside `users.service.ts`.

**Scope:** one service, mapper, ability helper, or util. Prefer a narrow Nest `TestingModule` with only the providers under test, or no Nest module for pure functions.

**Typical pattern:**

- Stub `PrismaService` with `mockDeep<PrismaClient>()` from `jest-mock-extended`.
- Stub `PinoLogger` and other collaborators with `useValue` (see [logging conventions](./logging-conventions.md#7-stubbing-pinologger-in-unit-tests)).
- Assert business rules, thrown Nest exceptions, and Prisma call shapes — not HTTP status codes or response envelopes.

Unit tests stay fast and local so feature folders can grow without pulling in the whole app graph.

---

## Integration tests

**Location:** `test/integration/` (not colocated under `src/`).

**Naming:** `*.integration.spec.ts` so they use a separate Jest config (`test/integration/jest-integration.json`) and never run under `npm test`.

### Why “integration” (not E2E)

These suites boot the real `AppModule`, apply `configureApp()`, and hit the HTTP server with Supertest. That integrates:

- controllers and DTOs / validation pipes
- auth guard wiring (via a test JWT guard)
- CASL abilities
- response envelope / error shaping
- module wiring across features

They are **not** end-to-end against production-like infrastructure. `createTestApp()` still overrides Prisma (and often S3) with mocks; Auth0/JWKS are stubbed in `jest-integration.setup.ts`. A failing integration test means the Nest HTTP stack or wiring broke — not that Postgres or S3 misbehaved.

### Why under `test/` instead of colocated

Integration specs share one boot path and helpers (`createTestApp`, auth fixtures, domain fixtures). Keeping them under `test/integration/`:

- avoids co-locating a full-app harness next to every feature folder
- keeps a single Jest root, setup file, and env stubs for the suite
- mirrors Nest’s usual `test/` layout and makes the “heavier than unit” boundary obvious in CI and locally

Feature-owned **unit** specs stay colocated. Shared integration fixtures live in `test/integration/helpers/`.

### Layout

| Path                                         | Role                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `test/integration/*.integration.spec.ts`     | HTTP suites (users, events, photos, app smoke)    |
| `test/integration/helpers/create-test-app.ts`| Boots `AppModule`, swaps JWT guard + Prisma mock  |
| `test/integration/helpers/*fixtures.ts`      | Tokens, users, events, photos payloads            |
| `test/integration/helpers/test-jwt-auth.guard.ts` | Maps Bearer tokens → test users              |
| `test/integration/jest-integration.json`     | Jest config for this suite only                   |
| `test/integration/jest-integration.setup.ts` | Env stubs + Auth0/passport mocks                  |

**Sample:** `users.integration.spec.ts` posts to onboarding/profile routes with `authHeader()`, stubs Prisma return values, and asserts status codes plus the `{ data, meta }` envelope.

When a suite needs an extra override (e.g. mock `S3Service`), pass a `configureModule` callback into `createTestApp`.

---

## Choosing a layer

| You are changing…                         | Prefer                                      |
| ----------------------------------------- | ------------------------------------------- |
| Service logic, mappers, abilities, utils  | Unit (`*.spec.ts`)                          |
| Route contract, authz, validation, wiring | Integration (`*.integration.spec.ts`)       |
| Rare, high-value path across real deps    | Future E2E (do not duplicate unit/integration coverage) |

Do not re-assert the same service branches in integration that unit tests already cover in depth. Integration should prove the HTTP boundary and cross-cutting stack.

---

## Future: E2E

We plan a thin E2E layer that runs **without mocks** against real dependencies (database, and other externals as needed). Goals:

- Cover a small set of **critical workflows** (happy paths and a few failure modes that only show up with real I/O).
- **Not** replay the full unit/integration matrix — E2E is slow and would dominate CI latency if it grew unchecked.
- Live under `test/` (separate from integration), with its own Jest (or runner) config and scripts.

Until that suite exists, treat integration as the top of the automated pyramid for the API.
