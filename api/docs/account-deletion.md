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

Auth0-first narrows that path: the identity can no longer mint fresh tokens. The cost is the Case B window (IdP gone, app row may remain). We accept that window and design for it with a flag and a reconciler.

Note that ordering alone does not close resurrection. Access tokens are verified against the JWKS signature and `exp`; the API never asks Auth0 whether the subject still exists, so deleting the Auth0 user does not invalidate tokens it already issued. What closes it is the tombstone (authentication.md §6). Ordering bounds the exposure; the tombstone removes it.

**Prep goes before the Auth0 call.** Within Auth0-first, the local prep in §6 runs first. The Management API delete cannot be compensated, so nothing irreversible happens until the row can actually be torn down. Putting an irreversible step ahead of the step most likely to fail is how a saga strands people: login destroyed, data retained, and no way for them to ask again.

**Trade-off summary**

| Order                                | Worst failure           | Main risk                           |
| ------------------------------------ | ----------------------- | ----------------------------------- |
| Database committed, then Auth0 fails | Row gone, Auth0 alive   | JIT recreates the account           |
| Auth0 gone, then database fails      | Auth0 gone, row remains | Orphan app data; user may not retry |

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
4. Sign in with Apple only: revoke the Apple token Auth0 holds for the user
   (idempotent: Apple answers 200 for an already-revoked token)
5. Delete Auth0 user (idempotent: already-gone / 404 counts as success)
6. Set auth0DeletedAt
7. In one transaction: upsert DeletedProviderSub tombstone, then delete the User row
8. Best-effort S3 / other side cleanup (same spirit as event photo purge)
```

Step 4 exists because Apple treats the app as still authorised until the token is revoked, and that token lives on the Auth0 user, so it must be revoked before the user is deleted. It repeats on every pass that still has an Auth0 user, which is safe. See [authentication.md](./authentication.md#10-sign-in-with-apple) for the rule and the ops setup.

Derived state from the two nullable timestamps (no separate status enum):

| `deletionStartedAt` | `auth0DeletedAt` | Meaning                                                  |
| ------------------- | ---------------- | -------------------------------------------------------- |
| null                | null             | Active account                                           |
| set                 | null             | Deletion in progress; Auth0 not confirmed cleared        |
| set                 | set              | Auth0 cleared; database teardown still owed (reconciler) |

### If Apple revocation fails (after the flag)

Two cases, decided by whether trying again could help:

- **Apple unreachable** (transport error, 5xx): the saga stops before the Auth0 delete and returns an error. `deletionStartedAt` stays set, the Auth0 user and its token stay put, and the next pass (client retry or reconciler) revokes again. Same shape as an Auth0 failure.
- **Apple refuses** (400: wrong client id, key not accepted), **the key cannot be loaded** (`APPLE_SIWA_PRIVATE_KEY` is not a valid PEM, so no request is made) or **no token to revoke** (Apple credentials not configured, management client lacks `read:user_idp_tokens`, connection stores no token): logged at `error` with `audit: true`, and the saga carries on to delete the Auth0 user. Apple's own guidance is that the deletion must still be honoured; the person then has to unlink the app under Settings → Apple ID → Sign in with Apple themselves. Retrying would only delay a deletion the person asked for, and the token is lost with the Auth0 user either way.
- **Auth0 refuses the token read** (403: management client lacks `read:users`): handled like any other Auth0 failure, the saga stops with an error and retries. This is a tenant misconfiguration rather than an Apple problem, and it fails loudly on purpose: grant the scope and the reconciler finishes the deletion with the token revoked.

### If Auth0 fails (after the flag)

Leave `deletionStartedAt` set and return an error. Do not delete the database user.
Retries (client or reconciler) call Auth0 again; `404` is treated as success so a lost success response cannot drop the durable marker.

### If Auth0 succeeds and database delete fails

Leave the row **with the deletion flag set** (and `auth0DeletedAt` if you have it). Return a server error: deletion is not fully complete.

A **reconciler** periodically finds users with deletion intent still set, re-runs prep + `user.delete`, and alerts if a row stays stuck.

It is **opt-in** (`ACCOUNT_DELETION_RECONCILER_ENABLED=true`): it decides which identities to delete from the tenant in `AUTH0_DOMAIN` using rows in `DATABASE_URL`, and those two are not paired outside a deployed environment. Same rule, and the same reason, as the photo orphan reconciler. After `ACCOUNT_DELETION_MAX_ATTEMPTS` failed passes a row stops being picked up and is reported once as `user.account.deletion_abandoned`: a failure that is not transient is not fixed by retrying it hourly, and an alert that fires forever is one nobody reads.

**Recovering an abandoned deletion.** The counter is never reset automatically, so once the underlying cause is fixed the row has to be handed back to the job by hand:

```sql
-- find them
SELECT id, "deletionStartedAt", "auth0DeletedAt", "deletionAttempts"
FROM "User" WHERE "deletionStartedAt" IS NOT NULL AND "deletionAttempts" >= 5;

-- hand one back to the reconciler
UPDATE "User" SET "deletionAttempts" = 0 WHERE id = '…';
```

The account stays locked out of every route while `deletionStartedAt` is set, so the person is not using it in the meantime.

**The job is not optional in a deployed environment.** A deletion that fails after its intent is stamped leaves the account refused on every route, and this job is the only thing that finishes it. With the job off, that state is permanent: no login, and the data still there. The API logs `user.account.deletion_reconciler.disabled` at `warn` on boot when that is the case.

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

## 6. Prep: making the row deletable

A deletion flag and a reconciler do not make the row deletable. `Event.creatorId`, `EventAccess.userId` and `Photo.addedById` used to RESTRICT, so `user.delete` failed for anyone who had created or joined a single event or uploaded a photo. Because the saga deletes Auth0 first, that failure cost the user their login and kept all their data.

Two things fix it, and both are needed.

**Schema.** The relations now say what should happen on their own:

| Relation             | On delete | Why                                                                                                      |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `EventAccess.userId` | `Cascade` | A membership has no meaning without its member.                                                          |
| `Event.creatorId`    | `SetNull` | Attribution only. Who may manage an event is `EventAccess`, never this column.                           |
| `Photo.addedById`    | `SetNull` | A photo may outlive its uploader; usage is summed per uploader, so it then counts toward nobody's quota. |

**`AccountDeletionPrepService`** (step 3 of the happy path above) applies the product rules the schema cannot express: handing over or deleting events the account organised, discarding uploads in flight, and applying the photo policy. One transaction, idempotent, so the reconciler repeats it safely. It returns the S3 keys, which are purged best effort after the row is gone.

**Accounts already being deleted do not count as cover.** Both organizer rules ignore members whose own `deletionStartedAt` is set. Without that, two members of one event leaving at the same time can strand it:

- two co-organizers both deleting: each counts the other as the remaining organizer, both skip the event, and it ends up with nobody in charge
- a sole organizer promoting a member who is themselves mid-deletion: the promotion is undone moments later when that member's row goes

Skipping them fixes both orderings, because the deletion flag is stamped in its own committed step _before_ prep runs. Either a concurrent deletion is already visible, in which case that candidate is skipped, or it has not started yet, in which case its own prep runs later and finds the organizer role it has just been handed. Isolation level does not help here: "the other member's prep ran first" is a perfectly valid serial order, so there is no conflict for the database to abort. The rule has to be in the query.

The event delete uses `deleteMany`, so a concurrent deletion that already removed the event is the outcome we wanted rather than an error.

The reconciler stays the **safety net** for crashes and for relations someone adds later. A schema or CI check — every new `User` relation is either cascading or explicitly handled in prep — is still worth adding.

---

## 6a. What happens to the account's data

| Data                                          | On deletion                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| Identity, profile (`UserDetails`)             | Deleted. No name or email survives.                                           |
| Memberships (`EventAccess`)                   | Deleted by cascade, after the organizer rules below.                          |
| Events organised alone, nobody else in them   | Deleted, with every photo still in them.                                      |
| Events organised alone, other members present | Handed over: the longest-standing member becomes an organizer.                |
| Events with another organizer                 | Untouched; only the membership goes.                                          |
| `Event.creatorId` on surviving events         | Null.                                                                         |
| Uploaded photos in surviving events           | `?photos=KEEP`: kept with no uploader. `?photos=DELETE`: removed everywhere. |
| Uploads in flight (`PENDING`)                 | Always discarded, objects purged.                                             |
| Storage quota, purchased limit                | Gone with the row. Kept photos count toward nobody's quota.                   |

### The photo choice is required, and KEEP is the one to offer

WhatsApp leaves the media you sent with the people you sent it to, and Telegram keeps a deleted sender's messages in the group. Both treat what you share into a group as belonging to the group from that moment. An event album is that kind of place: a guest's photos of the wedding are the couple's memories as much as the guest's, and losing them because a guest tidied up their phone a year later is the surprising outcome, not the safe one.

Privacy still wins when the person asks: `?photos=DELETE` removes their uploads everywhere. Either way the _link_ between person and photo is gone, which is the part that is their personal data. The choice is stored on the row with the intent, so a resumed saga honours what the user actually chose rather than a default.

So `?photos=` is **required**, with no server-side default. Both outcomes are irreversible and they are opposites: one leaves a stranger's binaries in an album, the other destroys other people's wedding photos. A client that forgets the parameter is a bug, and the only answer that cannot be the wrong one is a 400 — deletion is retriable, a wiped album is not. The app therefore has to ask, which is also what the App Store disclosure needs: the person is told that KEEP leaves their photos in the event and only the link to them is removed. `ACCOUNT_DELETION_PHOTO_POLICY_FALLBACK` (KEEP) is not that default; it is what a *resumed* saga uses if its row somehow carries no choice, because the reconciler has nobody left to ask.

### Events are handed over, not orphaned

Telegram leaves a channel whose owner deleted their account without an owner: admins keep working, but nobody can ever transfer or delete it. Those zombie channels are the outcome to avoid. WhatsApp instead promotes a member when the last admin leaves, and Everglow does the same, deterministically: participants before viewers, then whoever has been a member longest. A viewer can be promoted when nobody else is left, because an organizer who cannot upload still beats an event nobody can manage. Only an event with no other member at all is deleted.

### No grace period

Facebook and Instagram hold a deleted account for 30 days and let a sign-in cancel it; WhatsApp and Telegram delete immediately. A grace period needs a pending state, a scheduler, a restore endpoint, a mobile flow to cancel, and a story for hiding the account's content for a month without breaking events for everyone else. That is a product decision with its own UI. Immediate deletion is what Apple's requirement needs, and asking about the photos removes the largest regret.

---

## 6b. Edge cases

| Case                                           | Handling                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Organises an event with another organizer      | Membership removed; event untouched                                                                      |
| Only organizer, other members are participants | Longest-standing participant promoted                                                                    |
| Only organizer, other members are only viewers | Longest-standing viewer promoted                                                                         |
| Only member of the event                       | Event deleted with all its photos; S3 purged after commit                                                |
| Created an event it later left                 | `creatorId` set to null; nothing else                                                                    |
| Uploaded photos, `?photos=KEEP`                | Kept, `addedById` null; organizers can still delete them                                                 |
| Uploaded photos, `?photos=DELETE`              | Rows deleted in prep, objects purged after commit                                                        |
| Upload in flight                               | `PENDING` row deleted, key purged; a PUT landing later is an orphan for the photo reconciler             |
| Prep fails                                     | 500, Auth0 untouched, login intact, retryable                                                            |
| Auth0 fails after intent                       | 500, row and flag kept; reconciler retries, 404 counts as success                                        |
| Database delete fails after Auth0              | Row kept and flagged; reconciler finishes it                                                             |
| S3 purge fails                                 | Logged with counts; photo orphan reconciler reclaims; request still 204                                  |
| Any request with a pre-deletion token          | Generic 401; client signs out                                                                            |
| Same person signs in again later               | New account, new id, free tier (see authentication.md §6)                                                |
| Deletion abandoned after the attempt budget    | Reported once as `user.account.deletion_abandoned`; the row awaits a person (§4 runbook)                 |
| Two members of one event deleting at once      | Neither counts the other as cover; the event is handed to a member who is staying, or deleted if none is |
| Two co-organizers deleting at once             | The first to run prep hands over to a staying member; the second then sees real cover and skips          |
| Successor is promoted after their own prep ran | Cannot happen: a member mid-deletion is never chosen as successor                                        |
| Event already deleted by a concurrent deletion | `deleteMany` makes it a no-op, and the run is not counted as a deletion                                  |
| Account with a raised storage limit            | Limit gone with the row; refunds are billing's concern                                                   |
| Account never onboarded                        | Same flow; only the row to remove                                                                        |
| Missing `?photos=`                             | 400, nothing deleted; the choice is required                                                             |
| Unknown `?photos=` value                       | 400, nothing deleted                                                                                     |

---

## 7. What we are optimizing for

1. **No JIT resurrection** of an account the user asked to delete: Auth0 stops being a live login for that identity, and the tombstone stops the tokens it already issued.
1. **Nothing irreversible before something that can fail**: prep and its foreign keys come before the Auth0 call, so a failure never costs a login.
1. **No false atomicity** via long DB transactions around Auth0.
1. **Detectable, finishable** leftovers when database teardown fails after Auth0.
1. **Familiar ops model** aligned with photo orphan reconciliation, with order chosen for IdP risk.

Implementation details (column names, job schedule, exact prep steps) live with the users / Auth0 management code and can evolve. This document is the why.
