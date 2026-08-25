# Feature Test Case Standard

## Purpose

This document is the required format for feature-level QA specifications in Everglow. It is designed to be reviewed by people and consumed by an AI agent that will later generate automated tests. A feature specification records observable behavior; it must not silently redefine the implementation.

Store feature specifications in `docs/qa/features/<feature-name>.md` and use this document as the template.

## Authoring Rules

- Inspect the relevant UI, hooks, state, API client, server controller/service, data model, validation, routing, auth flow, and existing tests before writing cases.
- State whether each expectation is confirmed by code, an explicit product requirement, or an assumption. Put unresolved behavior in **Assumptions and Open Questions** and, when applicable, **Known Gaps / Expected Failures**.
- Test observable outcomes. Mention implementation details only in **Automation Notes** or **Related Requirements / Components**.
- Give one independently verifiable behavior to each test case. Split cases that fail for different reasons or need different fixtures.
- Use exact inputs, state transitions, request counts, status codes, messages, routes, and disabled/loading states. Avoid words such as “works,” “correct,” or “properly” without defining them.
- Keep tests deterministic. Do not depend on real time, production accounts, a live identity provider, or a shared mutable backend unless the test layer explicitly requires it.
- Do not specify retries, validation, permissions, responsive breakpoints, or messages that the feature does not have. Record desired but unimplemented behavior as a known gap instead.
- Prefer the lowest test layer that gives confidence, while retaining E2E coverage for critical user journeys and authorization boundaries.

## Feature Information

Every feature specification must begin with the following fields.

| Field                       | Required content                                                                  |
| --------------------------- | --------------------------------------------------------------------------------- |
| Feature name                | Human-readable feature name                                                       |
| Feature ID                  | Stable uppercase identifier used in every test ID                                 |
| Description                 | Current user-visible purpose and behavior                                         |
| Relevant components/modules | UI, hooks, stores/contexts, clients, server modules, routes, and schemas          |
| Dependencies                | Runtime services, libraries, platform capabilities, and upstream state            |
| Preconditions               | Shared state required by most cases                                               |
| Actors / user roles         | Authenticated, unauthenticated, owner, admin, or other applicable actors          |
| Out of scope                | Adjacent behavior intentionally excluded                                          |
| Assumptions                 | Explicit interpretation of ambiguous behavior; use numbered labels such as `A-01` |

Follow the table with these subsections when applicable:

- **Behavioral Contract:** concise, code-backed rules the tests enforce.
- **Data and Validation Contract:** fields, types, nullability, editability, limits, formats, and server constraints.
- **API Contract:** method, path, authentication, request, successful response, and applicable errors.
- **State Model:** initial, loading, success, empty, stale/refetching, submitting, and failure transitions.
- **Assumptions and Open Questions:** numbered decisions needed from product/design/engineering.
- **Known Gaps / Expected Failures:** expected behavior that the current implementation does not satisfy. Each item must reference affected test IDs.
- **Existing Automated Coverage:** relevant tests already present and the behaviors not yet covered.

## Test Case IDs

Use `<FEATURE-ID>-<CATEGORY>-<NNN>`, with numbering starting at `001` and remaining sequential within each category. IDs must never be reused for a different behavior.

| Prefix   | Category                                             |
| -------- | ---------------------------------------------------- |
| `FUNC`   | Functional behavior and user actions                 |
| `RENDER` | Rendering and displayed data                         |
| `VAL`    | Input and payload validation                         |
| `STATE`  | Local, cached, asynchronous, and transition state    |
| `API`    | API and network behavior                             |
| `AUTH`   | Authentication and session lifecycle                 |
| `PERM`   | Authorization, ownership, and permissions            |
| `NAV`    | Navigation, deep links, refresh, and return behavior |
| `UI`     | Visual/interaction state and responsive behavior     |
| `A11Y`   | Accessibility and assistive technology behavior      |
| `EDGE`   | Unusual but supported data or interaction            |
| `SEC`    | Security-oriented expected behavior                  |
| `REG`    | Cross-feature regression risk                        |

Use the narrowest applicable category. Do not duplicate one behavior under several prefixes.

## Priority

| Priority | Meaning                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| Critical | Failure prevents the feature from functioning, loses/corrupts data, or creates a serious security/privacy issue   |
| High     | Core user functionality is unavailable or materially wrong                                                        |
| Medium   | Important state, failure path, compatibility, or edge behavior is wrong while the primary workflow remains usable |
| Low      | Minor UX, cosmetic behavior, or an unusual low-impact edge case                                                   |

## Test Type

Assign one primary type to each case.

| Type        | Use when                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Unit        | A pure function, service method, hook decision, payload transformation, or error mapping can be isolated        |
| Component   | A rendered component or hook/component composition is exercised with dependencies mocked                        |
| Integration | Multiple modules or an HTTP endpoint are exercised together, with only external boundaries mocked               |
| E2E         | A critical user journey runs through the real app surface and backend boundary in a production-like environment |

## Test Case Summary

Include every detailed test exactly once and in the same order.

| ID                   | Category   | Test Case          | Priority | Test Type |
| -------------------- | ---------- | ------------------ | -------- | --------- |
| `<FEATURE>-FUNC-001` | Functional | Concise test title | High     | Component |

After the table, include a **Coverage Breakdown** with totals by category, test type, and priority. The totals must equal the number of summary rows and detailed cases.

## Detailed Test Case Format

Use this exact field order for every case. Use `None` when data or setup is not needed; do not omit fields.

### `[TEST-ID] Test case title`

**Category:** Functional / Validation / UI / API / Authentication / Authorization / Accessibility / Error Handling / Edge Case / State Management / Navigation / Rendering / Security / Regression

**Priority:** Critical / High / Medium / Low

**Test Type:** Unit / Component / Integration / E2E

**Preconditions:**

- Required initial state, actor, route, feature flag, and dependency state.

**Test Data:**

- Exact input or fixture, including boundary values where relevant.

**Steps:**

1. Arrange the required state and mocks.
2. Perform one observable user action or system event.
3. Observe the resulting UI, state, navigation, or API interaction.

**Expected Result:**

- List exact assertions. Include what must not happen, such as no duplicate request or no cache mutation.

**Automation Notes:**

- Name external boundaries to mock, the suggested test layer/tooling, stable selectors or accessible names, request counts, and async behavior to await.
- Assert public output rather than hook internals unless the case is intentionally a hook unit test.

**Related Requirements / Components:**

- Requirement/assumption/gap IDs and relevant route, component, hook, client call, endpoint, DTO, or schema.

## Minimum Coverage Review

Mark each area as covered, not applicable, or an open question while designing a feature specification.

### Happy paths

- Initial render and normal data
- Primary actions and successful completion
- Persistence or cache synchronization after success

### Validation

- Valid, invalid, empty, missing, malformed, wrong-type, minimum, maximum, and over-maximum values
- Leading/trailing whitespace, Unicode, special characters, and unknown fields where applicable
- Client and server behavior distinguished explicitly

### State

- Initial, loading, success, empty, stale/refetching, submitting, success-after-submit, and failure-after-submit
- Reopening/reset, cancellation, repeated actions, and duplicate-submission protection

### API and network

- Successful response and exact request contract
- Applicable 400, 401, 403, 404, 409, and 422 responses
- 500, timeout/network failure, slow request, and malformed success response
- Retry behavior only when configured

### Authentication and authorization

- Authenticated, unauthenticated, expired/revoked session, current-user ownership, and cross-user attempts
- Client state cannot bypass server-side access control

### User interaction

- Click/press, typing, submit, cancel, confirmation, repeated/rapid actions, keyboard behavior, and disabled states

### Navigation

- In-app entry, direct/deep link, refresh, focus return, back/leave behavior, and post-action redirects

### UI and responsive behavior

- Conditional visibility, fallbacks, error/success feedback, loading indicators, light/dark theme, supported phone/tablet sizes, orientation, and long content

### Accessibility

- Semantic roles, accessible names, programmatic labels, state announcements, focus movement/restoration, keyboard/switch navigation, touch targets, image alternatives, and understandable errors

### Edge and security cases

- Null/partial/malformed data, Unicode, long values, stale/out-of-order responses, repeated actions, and unexpected values
- Output rendering is safe, sensitive fields are not exposed, unknown payload fields are rejected, and authorization is enforced server-side

### Regression risks

- Shared cache/context consistency, adjacent navigation/auth behavior, persisted data after revisit, and destructive action cleanup

## Automation Guidance

- Component tests should use accessible roles/names as selectors and mock React Query, routing, native alerts, image picker, and platform APIs at their public boundaries.
- Integration tests should execute the real validation pipe, response/error envelope, controller, service, and mapper where practical. Mock Auth0/JWT identity, Prisma, and object storage only at the system boundary.
- E2E tests should use isolated users and deterministic fixtures. Clean up created data and never share destructive-test accounts.
- Control promises explicitly to test slow requests and double presses. Assert both visible state and invocation count.
- For error matrices, separate materially different UI/state outcomes. Table-driven tests are acceptable when only input/status/message varies, but each specification ID must remain individually reportable.
- A test derived from a known gap should be checked in as skipped/expected-failing only if the project has an agreed convention; otherwise document the gap before implementation.

## Final Review Checklist

Before committing a feature specification, verify that:

- Summary rows, detailed cases, category totals, type totals, and priority totals match.
- IDs are unique and sequential within every used category.
- Every assumption and known gap is referenced by at least one case or explicitly informational.
- Happy, failure, boundary, auth, state transition, accessibility, and regression paths are covered or marked not applicable.
- Existing automated tests are identified so future agents do not duplicate coverage blindly.
- Expected results are observable and automation notes identify mocks and exact assertions.
- No case invents unsupported functionality without labeling it as a requirement assumption or known gap.
- Critical and High cases form a coherent minimum regression suite.
