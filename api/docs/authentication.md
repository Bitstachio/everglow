# Authentication

This document explains how Everglow authenticates API requests, why we outsource login to Auth0, how just-in-time (JIT) user provisioning works, and why we keep a tombstone of deleted identities. It is written for engineers who will touch auth or account deletion.

Related: [Account deletion](./account-deletion.md) covers the dual-store delete saga (Auth0 + application database). This document covers the request path and the JWT resurrection hole that deletion alone does not close.

---

## 1. What we outsource vs what we own

**Auth0 (identity provider)** owns:

- signup and login UX
- password / social credentials
- issuing and signing access tokens (JWTs)
- publishing public keys (JWKS) so we can verify those tokens

**Everglow** owns:

- the application `User` row and related app data
- authorization (what this user may do once we know who they are)
- mapping an Auth0 identity (`sub`) to our internal user id

We do not store passwords or implement our own login protocol. A valid Bearer JWT means Auth0 asserts that this `sub` is a real, currently non-expired session for our API audience. It does **not** by itself mean “this person still has an Everglow account we should treat as active.” That second fact lives in the application database (and, after deletion, in the tombstone store described below).

---

## 2. Request path

Guarded routes use `JwtAuthGuard`. On each authenticated request:

1. Extract the Bearer token from the `Authorization` header.
2. Verify the JWT cryptographically:
   - RS256 via Auth0 JWKS
   - expected `audience` and `issuer`
   - `exp` must be respected (`ignoreExpiration: false`)
3. Run `JwtStrategy.validate` with the payload (`sub`, and optionally `iat` / `exp`).
4. Resolve an application user via `UsersService.resolveByProviderSub(payload.sub)`.
5. Attach `{ id, sub }` to the request (`AuthenticatedUser`): our UUID plus the Auth0 subject.

Controllers then use `@CurrentUser()` for the app user id. Authorization (CASL, etc.) builds on that id, not on raw Auth0 claims alone.

```text
Request + Bearer JWT
  → signature / aud / iss / exp checks
  → resolveByProviderSub(sub)
  → request.user = { id, sub }
  → controller / policies
```

---

## 3. Why an identity provider

Building login ourselves would mean owning credential storage, reset flows, MFA, social connectors, token issuance, and key rotation. Auth0 already does that. We verify tokens locally with JWKS and keep our domain model thin: one stable `providerSub` per Auth0 user, one Everglow `User` per active account.

The trade-off is familiar for dual-store systems: Auth0 and the application database do not share a transaction. Account deletion must coordinate both (see [account-deletion.md](./account-deletion.md)). Auth on the hot path stays simple: verify JWT, resolve app user.

---

## 4. JIT provisioning

On first successful authenticated request for an unknown `providerSub`, `resolveByProviderSub` creates the database `User` row. That is **just-in-time (JIT) provisioning**.

```text
find User by providerSub
  → found → return it
  → missing → create User { providerSub } → return it
```

### Why we keep JIT

An alternative is to verify the JWT only and create the user on a separate “bootstrap” or post-registration hook. That splits identity proof from account creation. If Auth0 signup succeeds and the create call fails, the person can hold a valid token but have no Everglow user. Every normal API call then fails until something retries create. That is a **half-registration**: identity exists in Auth0, app account does not.

JIT collapses those steps on the request path we already trust. If the token is valid and we have never seen this `sub`, we create the row as part of resolving the caller. There is no separate provision step that can fail while login still “worked.” Retries of ordinary API traffic finish provisioning naturally.

That convenience is why JIT stays. The cost is that “no row for this `sub`” is ambiguous: it might be a brand-new user, or it might be someone whose row we just deleted while their access token is still valid. Tombstones remove that ambiguity for deleted identities.

---

## 5. The hole: JWT resurrection after delete

Access tokens remain valid until `exp` even after we delete the Auth0 user and the database `User`. Deleting the IdP user stops **new** logins for that identity. It does **not** invalidate JWTs that were already issued.

Without an extra check, this sequence is possible:

1. User deletes their account. Auth0 identity and `User` row are gone.
2. The client (or anything still holding the token) calls the API with the old Bearer JWT.
3. Signature and expiry checks pass.
4. JIT sees an unknown `sub` and **creates a new `User`**, undoing permanent deletion for that identity until the token expires.

Client-side logout on delete helps UX. It is not a security boundary. We cannot assume the token was discarded.

Auth0-first deletion (documented in [account-deletion.md](./account-deletion.md)) prevents resurrection via **fresh** Auth0 login while the IdP user still exists. Tombstones close the remaining case: **in-flight access tokens** after the row is gone.

---

## 6. Tombstones

A **tombstone** is a durable record that this `providerSub` belonged to an account we already deleted. It is not the full user profile. It is enough to answer: “may JIT create a user for this `sub`?”

### Rules

1. When account deletion removes the `User` row, write a `DeletedProviderSub` tombstone in the same database transaction (tombstone first, then delete). The key is a **SHA-256 of the `providerSub`**, not the subject itself: this table outlives the accounts in it, and a readable list of the identities that asked to be forgotten is exactly what it must not become. It answers "have I seen this subject?" without being able to name one. `formerUserId` stays for audit; it is an internal id, not an external identifier.
2. In `resolveByProviderSub`, **before** create:
   - if a live `User` exists with `deletionStartedAt` set → reject with a **generic 401** (same client message as any other unauthorized request; deletion reason stays in server logs only)
   - if a live `User` exists → return it
   - if a tombstone exists for `sub` **and the token was issued before `deletedAt`** → do not create; reject with the same generic 401
   - if a tombstone exists but the token was issued **after** `deletedAt` → the person signed in again, so JIT create a fresh account (see below)
   - otherwise → JIT create as today (real first login)
3. Keep tombstones at least as long as the maximum access-token lifetime we issue (longer is fine and simpler). After that window, an old JWT cannot authenticate anyway.

Mid-deletion rows that still exist (`deletionStartedAt` set) are rejected on the resolve path before the hard delete and tombstone. See [account-deletion.md](./account-deletion.md).

### Re-registration after delete

Tombstones are keyed by Auth0 `providerSub`, not by email or “this human forever.”

For a **database connection** (email and password), a later signup creates a new Auth0 identity and therefore a new `sub`. That new `sub` has no tombstone, so JIT creates a fresh Everglow user.

For a **social connection** (Google, Apple), it does not work that way. Auth0 derives the `sub` from the provider's stable user id, so `google-oauth2|1234` is the same before and after we delete the Auth0 user. Signing in with the same Google account produces the **same** `sub`, hits the tombstone, and would lock that person out of the product for good. Universal Login offers whichever connections the tenant enables, so this is not hypothetical.

The `iat` comparison is what separates the two cases. A tombstone blocks the tokens the deleted account left behind, not the person:

- a token minted **before** `deletedAt` is a leftover of the deleted account → reject
- a token minted **after** `deletedAt` means they passed Auth0 login again → a real new sign-in, so provision a fresh, empty account

The deletion timestamp is refreshed whenever the same subject is tombstoned again, so a second deletion is judged against the second timestamp rather than the first.

A token with no `iat` cannot be placed in time and is refused. Auth0 always sets it.

---

## 7. Mental model

| Fact                                                      | Who decides                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| “This token is a valid Auth0 access token for our API”    | JWT verification (JWKS, aud, iss, exp)                            |
| “This `sub` should have an Everglow account right now”    | Database `User`, constrained by tombstones and deletion flags     |
| “Create an account because we have never seen this `sub`” | JIT in `resolveByProviderSub`, only when no user and no tombstone |

Valid JWT proves identity. Tombstone proves we already honored a delete for that identity. JIT creates only when both “no user” and “not deleted” are true.

---

## 8. Why not “pending → third party → confirm → ready” like photos?

Photo upload uses a reservation pattern (see [photos-architecture.md](./photos-architecture.md)):

```text
1. API inserts a Photo row (PENDING) and reserves quota
2. Client uploads bytes to S3 with a presigned URL
3. Client calls confirm; API checks S3 and flips the row to READY (or cleans up)
```

That fits photos because **Everglow starts the dual-store work**. We need a local row and a storage key before the external write. S3 can succeed or fail independently. Confirm answers “did the bytes actually land?” Pending is meaningful: the slot exists, the object might not.

Registration with Auth0 is the **other way around**:

```text
1. User signs up / logs in in Auth0 (IdP finishes first)
2. Client receives a JWT
3. First authenticated API call JIT-creates the User row
```

We do not call Auth0 to create the identity as part of an Everglow-orchestrated signup. Auth0 Universal Login (or the SDK) creates the identity **before** our API is involved. By the time we see a request, the third-party step has already succeeded, and the JWT is the proof. There is nothing left to “confirm” with Auth0 for basic provisioning.

A `PENDING` user row before Auth0 would also have no natural key. `providerSub` does not exist until Auth0 creates the user. You would invent a temporary id, then somehow bind it after login. That adds a state machine without removing the dual-store problem; it mostly invents half-states we avoid with JIT.

|                                    | Photos + S3                      | Users + Auth0                        |
| ---------------------------------- | -------------------------------- | ------------------------------------ |
| Who starts?                        | Our API (mint slot, then upload) | Auth0 (login, then our API)          |
| What can fail after local write?   | S3 PUT missing or mismatched     | N/A on first login: IdP already done |
| Proof the external side worked     | `HeadObject` on confirm          | Valid JWT on the request             |
| Local row before external success? | Yes (PENDING + quota)            | No useful `providerSub` yet          |
| Pattern we use                     | Reserve → upload → confirm       | JIT create after JWT verifies        |

The photo pattern is for **we reserved locally, then asked the outside world to finish**. Registration is **outside world already finished, then we create locally**. JIT is the small local write after proof we already trust.

Account **deletion** is closer in spirit to a saga across two stores (flags, Auth0 delete, then database delete). That is documented in [account-deletion.md](./account-deletion.md). Signup does not need the same pending/ready machine.

---

## 9. What we are optimizing for

1. **No half-registration** on first use: valid token plus unknown `sub` provisions the app user on the same path.
2. **No JWT resurrection** after delete: a still-valid access token must not recreate a tombstoned `providerSub`.
3. **Clear ownership**: Auth0 for credentials and tokens; Everglow for app users, authorization, and deletion intent.
4. **Re-join via new identity**: a new Auth0 `sub` after a real re-signup can provision a new app user; the old `sub` stays blocked.

Implementation details (table or column names, exact status codes, retention job) live with the users / auth code and can evolve. This document is the why.
