# Account Deletion

Deleting an Everglow account means removing the user in **two stores** that do not share a transaction:

1. **Auth0** (identity provider): login identity, `providerSub`
2. **Application database**: `User` row and related app data

This document explains the problem, why a single database transaction across both stores is not sound, how delete ordering trade-offs work, and the saga / state-machine approach we use. It is written for engineers who will touch this flow later.

JIT provisioning matters here: on first login, `UsersService.resolveByProviderSub` creates a database `User` for an Auth0 `sub` if none exists. Any design that deletes the database row while Auth0 still works can recreate the account on the next login.

---

## 1. Problem

`DELETE /users/me` must eventually leave:

- no Auth0 user for that identity
- no database `User` (and related data cleaned up according to product rules)
- no easy way for the same Auth0 identity to come back as a “new” app user via JIT

Auth0 and the application database are separate systems. You can succeed in one and fail in the other. Crashes and timeouts happen in between. There is **no atomic commit** that covers both.

So the design goal is not “never be inconsistent for a moment.” It is:

- make the dangerous inconsistencies rare
- make leftover work **detectable**
- make leftover work **finishable** without the user still being logged in

---

## 2. Why not one database transaction around Auth0?

A common first instinct:

```text
BEGIN
  delete the database user (and related rows)
  call Auth0 Management API to delete the user
  if Auth0 fails → ROLLBACK
  if Auth0 succeeds → COMMIT
```

That looks like atomicity. It is not a sound approach for this system.

**The database cannot commit Auth0.** The Management API call is an HTTP request to another service. Putting it inside an open DB transaction does not make Auth0 part of that transaction. At best you delay when the local delete becomes visible.

**Holding a transaction open across Auth0 is harmful:**

- Auth0 can be slow, retry, or time out. The DB transaction stays open the whole time.
- Locks and a busy connection sit on the pool while the network call runs.
- Process crash or commit failure after Auth0 already deleted the identity still leaves **Auth0 gone and the database rolled back** (user row still there). You did not escape dual-store failure; you only changed which window you hit.

**Rollback cannot undo Auth0.** If Auth0 succeeded and then commit fails, “rollback the user” only restores the database. The IdP user is already gone.

Treat “wrap Auth0 in a DB transaction” as a false atomicity. Prefer a short database transaction for local prep only, then call Auth0 outside it, then finish local delete, with a durable marker for recovery.

---

## 3. Ordering: Auth0 first vs database first

Assume prep has reduced FK failures, but either step can still fail.

### Case A: Auth0 delete fails first

The database row has not been deleted yet (or only a deletion flag was set and can be cleared).

| Outcome                | Effect                  |
| ---------------------- | ----------------------- |
| User can still log in  | Yes (Auth0 still there) |
| App data still present | Yes                     |
| Retry                  | Safe: try again         |
| JIT resurrection risk  | None for this attempt   |

This failure mode is **safe and user-recoverable**. Return an error; do not pretend the account is gone.

### Case B: Auth0 succeeds, database delete fails

Auth0 identity is gone. The `User` row (and possibly related data) may still exist.

| Outcome                             | Effect                                          |
| ----------------------------------- | ----------------------------------------------- |
| User can usually log in again       | No (IdP gone)                                   |
| App data / PII may remain           | Yes until cleanup finishes                      |
| Client retry of `DELETE /users/me`  | Often impossible (no valid login)               |
| JIT with the **same** `providerSub` | Cannot resurrect that Auth0 user                |
| New Auth0 signup (new `sub`)        | New database user; old row can become an orphan |

This failure mode is **worse for data deletion guarantees** and **worse for retries**, because the person who asked to delete may no longer authenticate.

### Why we still prefer Auth0 before hard database delete

Database-first (committed delete, then Auth0) has a sharp failure if Auth0 fails after the row is gone: the next login with the same Auth0 user **JIT-provisions a new `User`**. The account looks “undeleted.” That violates the intent of account deletion.

Auth0-first avoids that resurrection path. The cost is the Case B window (IdP gone, app row may remain). We accept that window and design for it with a flag and a reconciler, instead of accepting JIT resurrection.

**Trade-off summary**

| Order                                 | Worst failure           | Main risk                           |
| ------------------------------------- | ----------------------- | ----------------------------------- |
| Database committed, then Auth0 fails  | Row gone, Auth0 alive   | JIT recreates the account           |
| Auth0 gone, then database fails       | Auth0 gone, row remains | Orphan app data; user may not retry |

We choose the second row’s risk, then mitigate it.

---

## 4. The approach: deletion flag + Auth0 + finish database delete + reconciler

This is a small **saga / state machine** for dual-store delete. Durable intent lives in the database. Auth0 is an external step. A background job finishes what the request could not.

### Happy path (sketch)

```text
1. Load user
2. Mark deletion intent: set deletionStartedAt
3. Prep related database data so user.delete is likely to succeed
   (events, memberships, photos, etc. per product rules)
4. Delete Auth0 user (idempotent: already-gone / 404 counts as success)
5. Set auth0DeletedAt
6. In one transaction: upsert DeletedProviderSub tombstone, then delete the User row
7. Best-effort S3 / other side cleanup (same spirit as event photo purge)
```

Derived state from the two nullable timestamps (no separate status enum):

| `deletionStartedAt` | `auth0DeletedAt` | Meaning |
|---|---|---|
| null | null | Active account |
| set | null | Deletion in progress; Auth0 not confirmed cleared |
| set | set | Auth0 cleared; database teardown still owed (reconciler) |

### If Auth0 fails (after the flag)

Leave `deletionStartedAt` set and return an error. Do not delete the database user.
Retries (client or reconciler) call Auth0 again; `404` is treated as success so a lost success response cannot drop the durable marker.

### If Auth0 succeeds and database delete fails

Leave the row **with the deletion flag set** (and `auth0DeletedAt` if you have it). Return a server error: deletion is not fully complete.

A **reconciler** periodically finds users with deletion intent still set, re-runs prep + `user.delete`, and alerts if a row stays stuck past an age or attempt budget.

While flagged:

- Do not treat the user as a normal active account.
- Do not JIT-provision a fresh life for that identity in a way that undoes deletion intent.
- In-flight JWTs remain cryptographically valid until they expire even after Auth0 and the row are gone. That is a separate hole from “Auth0 still alive.” We close it with deleted-`providerSub` tombstones on the JIT path; see [authentication.md](./authentication.md).

### Why the flag matters

Without a flag, “Auth0 gone, database row still here” is hard to find reliably. You would be guessing from Auth0 API scans or from failed requests that nobody can repeat.

With a flag:

- Intent is durable even if the process crashes after Auth0 succeeds.
- The reconciler has a clear query: deletion started (and optionally Auth0 already cleared), row still present.
- Ops get a defined recovery path instead of a silent orphan.

The flag is not a hack. It is the local record that a cross-system delete is in progress, the same way an outbox or “pending” status records work that must finish later.

---

## 5. Same family as the photo system (order flipped on purpose)

Photo objects live in **S3** and metadata in the **application database**. Event delete (and related flows) treat the database as the source of truth for “does this photo exist?”, remove rows first, then purge S3 best-effort. The photo orphan reconciler deletes S3 objects that no longer have a `Photo` row.

Account deletion uses the **same idea**: accept a short dual-store gap, make leftovers detectable, heal with a reconciler. The **order is flipped** because the dangerous leftover is different.

|                                    | Photos                                                               | Account deletion                                            |
| ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Stores                             | Database + S3                                                        | Database + Auth0                                            |
| Canonical for “exists?” in the app | Database `Photo` row                                                 | App `User` row, but login is Auth0                          |
| Delete first (request path)        | DB row                                                               | Auth0 identity (after flag + prep)                          |
| What the reconciler cleans         | S3 objects without a row                                             | Flagged `User` rows that should be gone                     |
| Why that order                     | Orphan bytes are recoverable; a row without an object breaks UX more | Leaving Auth0 alive after “deleted” allows JIT resurrection |

So: not a different philosophy from photos. Same “commit one side, reconcile the other,” ordered for identity vs object-storage failure modes.

---

## 6. Prep still matters

A deletion flag and reconciler do not replace clearing RESTRICT foreign keys before `user.delete`. Today, `Event.creatorId`, `EventAccess.userId`, and `Photo.addedById` all restrict deleting a user.

Prep (and product rules for owned events vs memberships vs uploads) should run so `user.delete` usually succeeds. The reconciler is the **safety net** for holes, crashes, and future relations someone forgets. Prefer also adding a schema or CI check later: every new `User` relation is either cascading or explicitly handled in account deletion prep.

---

## 7. What we are optimizing for

1. **No JIT resurrection** of an account the user asked to delete (Auth0 must not remain as a live login for that identity after we commit to deletion).
2. **No false atomicity** via long DB transactions around Auth0.
3. **Detectable, finishable** leftovers when database teardown fails after Auth0.
4. **Familiar ops model** aligned with photo orphan reconciliation, with order chosen for IdP risk.

Implementation details (column names, job schedule, exact prep steps) live with the users / Auth0 management code and can evolve. This document is the why.
