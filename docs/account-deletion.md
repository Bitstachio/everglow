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
2. Pre-flight: check the deletion can finish (Auth0 management access and,
   for an Apple identity, Sign in with Apple); if not, 503 and nothing written
3. Claim the row and mark deletion intent: set deletionStartedAt (once) and
   the claim's lease, in one statement
4. Prep related database data so user.delete is likely to succeed
   (events, memberships, photos, etc. per product rules), writing the S3 keys
   it collects to the outbox in the same transaction; then drain the outbox
5. Sign in with Apple only: revoke the Apple token Auth0 holds for each of the
   user's Apple identities (idempotent: Apple answers 200 for an
   already-revoked token)
6. Delete Auth0 user (idempotent: already-gone / 404 counts as success)
7. Set auth0DeletedAt
8. In one transaction: lock the row, upsert the DeletedProviderSub tombstone with
   the account's suspension and event bans, null its username on report
   evidence (except under a child-safety or law-enforcement hold), then delete
   the User row (§6a)
```

Step 5 exists because Apple treats the app as still authorised until the token is revoked, and that token lives on the Auth0 user, so it must be revoked before the user is deleted. It repeats on every pass that still has an Auth0 user, which is safe. See [authentication.md](./authentication.md#10-sign-in-with-apple) for the rule and the ops setup.

Derived state from the two nullable timestamps (no separate status enum):

| `deletionStartedAt` | `auth0DeletedAt` | Meaning                                                  |
| ------------------- | ---------------- | -------------------------------------------------------- |
| null                | null             | Active account                                           |
| set                 | null             | Deletion in progress; Auth0 not confirmed cleared        |
| set                 | set              | Auth0 cleared; database teardown still owed (reconciler) |

### Before anything is written: the pre-flight

Every step after the intent is stamped is either irreversible (prep deletes events and photos, hands rolls over) or external (Apple, Auth0). If the external steps cannot work at all, starting is what strands the person: their rolls are gone, their login is still there, and the account is locked. So `DELETE /users/me` first asks `AccountDeletionPreflightService` whether the saga could finish, and answers **503 `ACCOUNT_DELETION_UNAVAILABLE`** with nothing written when it could not:

- the management credentials (`AUTH0_MANAGEMENT_CLIENT_ID`, `AUTH0_MANAGEMENT_CLIENT_SECRET`) are set;
- a client-credentials grant for the Management API succeeds with them (a bad secret fails here), and its token carries `delete:users`, plus `read:users` and `read:user_idp_tokens` for an Apple identity (`Auth0ManagementService.checkAccess`). A successful probe is cached for as long as the token would live, at most 15 minutes; a failed one is not cached, so fixing the tenant takes effect on the next tap;
- for an Apple identity, the `APPLE_SIWA_*` values are set and the private key signs a client secret (`AppleSiwaService.revocationProblem`). Nothing is sent to Apple.

The refusal is logged as `user.account.deletion_unavailable` at `error` with the `blockers` and any `missingScopes`, which pages ([alerting.md](../api/docs/alerting.md)): it is a misconfiguration and every deletion is refused until it is fixed. The app says deletion isn't available right now and that nothing was deleted. The check covers what no retry fixes; an outage that starts after it is handled by resuming.

A row whose `auth0DeletedAt` is already set skips the check: only database work is left.

### Retrying, and who runs a deletion

A deletion that fails part way leaves the row flagged. The person can **tap Delete again**: `DELETE /users/me` is the one route that lets a flagged account through (`@AllowDeletionInProgress()`), and the saga resumes with the photo choice it started with (the request's `?photos=` is only read the first time). Every other route answers it **401 `ACCOUNT_DELETION_IN_PROGRESS`**: the status the guard always used, so an old client still signs out, with a code the app reads to say the account is being deleted instead of showing the signed-out slip. The app treats it as a sign-out, not an expired session, so nothing the account left on the phone (the upload tray's copies of picked photos) survives it.

Only one pass runs a deletion at a time. `User.deletionClaimedUntil` is a lease: the request takes it in the statement that stamps the intent, the reconciler takes it with `FOR UPDATE SKIP LOCKED`, and a pass only runs the saga for a row it holds. The lease is five minutes (`ACCOUNT_DELETION_CLAIM_LEASE_SECONDS`), longer than a pass can take; a failed pass gives it up at once, so the person's next tap can claim it. A request that finds the row held answers 401 `ACCOUNT_DELETION_IN_PROGRESS` (the reconciler is finishing it), or 204 when the row is already gone. A pass that finds the row deleted under it, by a concurrent pass that got there first, counts it as done rather than as a failure.

### If Apple revocation fails (after the flag)

Two cases, decided by whether trying again could help:

- **Apple credentials missing, the key unusable, or the management client without `read:users` / `read:user_idp_tokens`**: caught by the pre-flight, so the deletion never starts (503, above).
- **Apple unreachable** (transport error, 5xx): the saga stops before the Auth0 delete and returns an error. `deletionStartedAt` stays set, the Auth0 user and its token stay put, and the next pass (client retry or reconciler) revokes again. Same shape as an Auth0 failure.
- **Apple refuses** (400: wrong client id, key not accepted) or **no token to revoke** (the connection stores none): logged at `error` with `audit: true`, and the saga carries on to delete the Auth0 user. Apple's own guidance is that the deletion must still be honoured; the person then has to unlink the app under Settings → Apple ID → Sign in with Apple themselves, and the app's last screen (14.12) tells every Sign in with Apple account where to look, since the API cannot tell the app after the fact (the reconciler may be the one finishing). Retrying would only delay a deletion the person asked for, and the token is lost with the Auth0 user either way.
- **Several Apple identities** (only if account linking is ever turned on): each one's token is revoked; one Apple refuses does not stop the others. The step still only runs for a user whose primary identity is Apple, since the identities are read off the Auth0 user and linking is off today; turning linking on means dropping that gate in `AppleIdentityRevocationService` and requiring `read:users` for every deletion.

### If Auth0 fails (after the flag)

Leave `deletionStartedAt` set and return an error. Do not delete the database user.
Retries (the person tapping Delete again, or the reconciler) call Auth0 again; `404` is treated as success so a lost success response cannot drop the durable marker.

### If Auth0 succeeds and database delete fails

Leave the row **with the deletion flag set** (and `auth0DeletedAt` if you have it). Return a server error: deletion is not fully complete.

A **reconciler** runs hourly and finishes deletions their request could not. It claims one row at a time, oldest first, so each lease covers the pass that runs it: a row whose deletion started more than 10 minutes ago (`ACCOUNT_DELETION_RECONCILER_MIN_AGE_MINUTES`; a younger one belongs to its request, still running or about to be retried), under the attempt budget, and not held by another pass. It runs the pre-flight first (a refusal releases the row and is not an attempt: nothing about the row is wrong), then prep + Auth0 + `user.delete`. A failed attempt is logged as `user.account.deletion_reconcile.failed`, and, once the deletion is older than `ACCOUNT_DELETION_RECONCILER_STUCK_AFTER_HOURS`, as `user.account.deletion_stuck`: a deletion the run finishes is not stuck, however old. Each pass then purges tombstones past their retention (§6a).

It is **opt-in** (`ACCOUNT_DELETION_RECONCILER_ENABLED=true`): it decides which identities to delete from the tenant in `AUTH0_DOMAIN` using rows in `DATABASE_URL`, and those two are not paired outside a deployed environment. Same rule, and the same reason, as the photo orphan reconciler. After `ACCOUNT_DELETION_MAX_ATTEMPTS` failed passes a row stops being picked up and is reported once as `user.account.deletion_abandoned`: a failure that is not transient is not fixed by retrying it hourly, and an alert that fires forever is one nobody reads.

### The outbox: S3 work that survives a failed pass

Prep deletes rows whose objects then have to go too: the photos of deleted events and their covers, `DELETE` photos, uploads in flight, the avatar. Those keys used to live only in memory until the end of the saga, so a pass that failed at Apple or Auth0 lost them, and the objects stayed until the opt-in orphan reconciler found them, if it was on.

They are now written to `AccountDeletionOutbox` (`action = PURGE`, one entry per key, unique on `(action, s3Key)` so a resumed prep adds nothing twice) in prep's own transaction: the rows and the record of their objects commit together. `AccountDeletionOutboxService.drain` runs right after that commit, before Apple and Auth0, so a failure there costs no privacy; it purges through `PhotoPurgeService` (evidence first, derived copies with each original), removes what went, and keeps what S3 refused with `attempts + 1`. A resumed saga drains its leftovers on its own pass; the reconciler drains anything older than 10 minutes on every run, which covers a saga that finished while S3 was down. After `ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS` (24, a day of hourly runs) an entry is dropped with `user.account.deletion_outbox.given_up` and left to the S3 orphan reconciler. A key kept for evidence counts as done: the evidence job owns it from there. Every step is safe to repeat, so a request and the reconciler draining at once do the same work twice at worst.

### Accounts mid-deletion are out of sight

From the moment the flag is set the account is leaving, and if the deletion is abandoned it may stay flagged for a while. Its name, username and avatar should not linger on other people's screens meanwhile: `GET /events/:eventId/participants` leaves out members whose `deletionStartedAt` is set, and an invite preview never names such an organizer as the host (the next organizer is named, or none). Prep's organizer rules already ignore them as cover and as successors (§6). The member count on an invite still includes them, because joining still counts their membership until the row goes.

**Recovering an abandoned deletion.** The counter is never reset automatically, so once the underlying cause is fixed the row has to be handed back to the job by hand:

```sql
-- find them
SELECT id, "deletionStartedAt", "auth0DeletedAt", "deletionAttempts"
FROM "User" WHERE "deletionStartedAt" IS NOT NULL AND "deletionAttempts" >= 5;

-- hand one back to the reconciler
UPDATE "User" SET "deletionAttempts" = 0, "deletionClaimedUntil" = NULL WHERE id = '…';
```

**Service level.** A `user.account.deletion_abandoned` page is answered within one working day, and the deletion is finished, by hand or by handing it back, within 7 days of the page, well inside the 30 days PIPEDA treats as reasonable for an erasure request. If it cannot be (Auth0 tenant trouble, a relation prep does not handle), finish the database side by hand: delete the Auth0 user in the dashboard, set `auth0DeletedAt`, and hand the row back so the job tombstones and deletes it. Meanwhile the account is out of sight (above).

The account stays locked out of every route but `DELETE /users/me` while `deletionStartedAt` is set, so the person is not using it in the meantime; their own retry still goes through, and does not count against the budget.

**The job is not optional in a deployed environment.** A deletion that fails after its intent is stamped leaves the account refused on every route, and this job is the only thing that finishes it. With the job off, that state is permanent: no login, and the data still there. The API logs `user.account.deletion_reconciler.disabled` at `warn` on boot when that is the case.

While flagged:

- Do not treat the user as a normal active account: every route but `DELETE /users/me` answers 401 `ACCOUNT_DELETION_IN_PROGRESS`.
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

| Relation                                                            | On delete | Why                                                                                                                                                                      |
| ------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EventAccess.userId`                                                | `Cascade` | A membership has no meaning without its member.                                                                                                                          |
| `Event.creatorId`                                                   | `SetNull` | Attribution only. Who may manage an event is `EventAccess`, never this column.                                                                                           |
| `Photo.addedById`                                                   | `SetNull` | A photo may outlive its uploader; it still counts toward its event's gallery storage until the gallery closes.                                                           |
| `Report.reporterId`, `Report.reportedUserId`, `Report.resolvedById` | `SetNull` | A report is evidence that belongs to the event; it outlives whoever filed it, was named in it, or resolved it ([moderation.md](./moderation.md#what-happens-on-delete)). |
| `EventBan.userId`                                                   | `Cascade` | The row goes with the account, but the ban does not: the saga copies it onto the tombstone first (§6a). `EventBan.bannedById` is `SetNull`: the ban outlives the organizer who issued it. |
| `Event.coverUpdatedById`                                            | `SetNull` | Attribution of the current cover only; the cover stays.                                                                                                                  |
| `Event.deactivatedById`                                             | `SetNull` | Attribution of who deactivated the event only; it stays closed, and `deactivatedAt` stays set.                                                                           |
| `UsernameChange.userId`                                             | `Cascade` | The change history only enforces this account's limit. (Holding released usernames for a cool-down, EV-30, may want to keep it.)                                         |
| `UserBlock.blockerId`, `UserBlock.blockedId`                        | `Cascade` | A block means nothing once either account is gone.                                                                                                                       |

**`AccountDeletionPrepService`** (step 3 of the happy path above) applies the product rules the schema cannot express: handing over or deleting events the account organised, discarding uploads in flight, applying the photo policy, and collecting the avatar's key. One transaction, idempotent, so the reconciler repeats it safely. It writes the S3 keys (photos, the covers of deleted events, and the avatar alike) to the outbox in the same transaction (§4), and returns what it did to each event the account organized alone.

**Previewing it.** `GET /users/me/deletion-preview?photos=` runs the same preparation in a transaction that is rolled back and returns each event's outcome: `DELETED`, `HANDED_OVER` or `KEPT_FOR_REVIEW` (alone, but under review or with open reports that outlive the account). The delete screen labels each roll from it, so the label is what prep would really do rather than a guess from the member count. The photo choice is part of the question: deleting the photos closes the open reports on them, which can be all that keeps an event. Suspended accounts may ask, since they may delete themselves. Reports and blocks need no step here: their relations above settle them on their own.

**Accounts already being deleted do not count as cover.** Both organizer rules ignore members whose own `deletionStartedAt` is set. Without that, two members of one event leaving at the same time can strand it:

- two co-organizers both deleting: each counts the other as the remaining organizer, both skip the event, and it ends up with nobody in charge
- a sole organizer promoting a member who is themselves mid-deletion: the promotion is undone moments later when that member's row goes

Skipping them fixes both orderings, because the deletion flag is stamped in its own committed step _before_ prep runs. Either a concurrent deletion is already visible, in which case that candidate is skipped, or it has not started yet, in which case its own prep runs later and finds the organizer role it has just been handed. Isolation level does not help here: "the other member's prep ran first" is a perfectly valid serial order, so there is no conflict for the database to abort. The rule has to be in the query.

The event delete uses `deleteMany`, so a concurrent deletion that already removed the event is the outcome we wanted rather than an error.

The reconciler stays the **safety net** for crashes and for relations someone adds later. A schema or CI check — every new `User` relation is either cascading or explicitly handled in prep — is still worth adding.

---

## 6a. What happens to the account's data

| Data                                          | On deletion                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Identity, profile (`UserDetails`)             | Deleted. The username survives only as a report's evidence while a child-safety or law-enforcement hold runs (below). |
| Avatar                                        | Always deleted, whatever `?photos=` says: row by cascade, object purged.       |
| Memberships (`EventAccess`)                   | Deleted by cascade, after the organizer rules below.                           |
| Events organised alone, nobody else in them   | Deleted, with every photo still in them and the cover image. One under review or with an open report is kept instead, without members, for the platform ([moderation.md §7](./moderation.md#7-evidence-deletes-and-retention)). |
| Events organised alone, other members present | Handed over: the longest-standing member becomes an organizer.                 |
| Events with another organizer                 | Untouched; only the membership goes.                                           |
| `Event.creatorId` on surviving events         | Null.                                                                          |
| Uploaded photos in surviving events           | `?photos=KEEP`: kept with no uploader until the gallery closes. `?photos=DELETE`: removed from every event; a reported one keeps its evidence copy (below). |
| Uploads in flight (`PENDING`)                 | Always discarded, objects purged.                                              |
| Reports filed, received or resolved           | Kept with the account's id nulled, for the report retention window, not tied to the event (below). |
| Blocks, in either direction                   | Deleted by cascade.                                                            |
| A suspension, event bans                      | Carried on the tombstone: a later sign-in with the same identity gets them back (below). |

### What outlives the account

Deletion removes the person from the product. A few records stay because they are the only proof that something happened, or the only thing still enforcing a decision about the account. Each has a fixed maximum, as PIPEDA principle 4.5 and Quebec's Law 25 ask.

| What stays                                                          | For how long                                                                                                                                                         | Why (legal basis)                                                                                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reports filed, received or resolved, with the reporter's `note`     | `REPORT_RETENTION_DAYS` (1 year) after the report closes, longer under a hold. `reporterId`, `reportedUserId` and `resolvedById` are nulled at once; `Report.eventId` is nulled when the event goes, the report is not | Safety records and repeat-offender history; a CyberTipline report must be preserved a year (18 U.S.C. §2258A(h)). The note can name third parties, so it is never logged |
| Evidence: the copy of a reported photo or cover, its hash and metadata, the subject's id | As its report. Survives `?photos=DELETE`: the reported object was copied to `evidence/` before the delete                                                            | Nobody can erase what a report is about before it is judged ([moderation.md §7](./moderation.md#7-evidence-deletes-and-retention)); same preservation duty          |
| The subject's username on that evidence                             | Nulled at deletion. Kept only while a `CHILD_SAFETY` or `LAW_ENFORCEMENT` hold runs; the daily evidence job nulls it once the hold ends                                | A preservation request may need to name the account (18 U.S.C. §2258A(h), §2703(f)); otherwise a name has no purpose once the account is gone                    |
| The account id inside object keys (`photos/{userId}/…`)             | KEEP'd photos until their gallery closes; evidence copies as their report; CloudTrail records a year ([photo-privacy.md](./photo-privacy.md))                         | An opaque internal id, not an identifier anyone outside can resolve; renaming objects would break the evidence chain and the audit trail                         |
| The tombstone: SHA-256 of the provider subject, former user id, `deletedAt` | 30 days (`TOMBSTONE_RETENTION_DAYS`). With a suspension or a ban: at least `REPORT_RETENTION_DAYS` after the deletion, and while any report about the account is kept: OPEN, or until its retention or hold ends | Security safeguard (PIPEDA 4.7): stops access tokens the deleted account left behind from recreating it; past that, only what a carried sanction needs               |
| A suspension (`DeletedProviderSub.suspendedAt`)                     | As the tombstone, until a sign-in moves it onto the new account or the platform lifts it                                                                            | Enforcing the platform's decision, often a child-safety one, which two taps would otherwise undo; tied to the reports that justify it                            |
| Event bans (`CarriedBan`: subject hash, event, `bannedAt`)          | As the tombstone, until a sign-in turns them back into `EventBan` rows; each goes with its event                                                                    | Enforcing the organizer's decision; same reasoning                                                                                                                 |

**Suspension and bans carry over.** `completeAccountDeletion` reads the account's `suspendedAt` and its `EventBan` rows under a row lock (so a suspension or ban landing mid-deletion waits and then fails rather than vanishing), and writes them onto the tombstone in the transaction that deletes the row. A later sign-in with the same identity (the `iat` rule in [authentication.md §6](./authentication.md#6-tombstones)) creates the new account already suspended, with its original `suspendedAt`, and re-creates the bans for events that still exist, logged as `user.account.suspension_carried_over` and `user.account.bans_carried_over`. Both move off the tombstone in the same transaction, so each is lifted in one place: `POST /admin/users/:userId/unsuspend` on the new account, or on the deleted account's former id while nobody has signed in; organizers lift bans as usual. A database identity (email and password) gets a new `sub` on re-signup and so carries nothing over; that gap is the same as signing up with a new email, and is left to reports.

`user.account.suspension_carried_over` is an audit record (`info`, `audit: true`), not an alert: the platform already decided, the account can only read and delete itself, and nobody has anything to do.

**The tombstone purge** runs at the end of every account-deletion reconciler pass (`purgeExpiredTombstones`). Tombstones that carry nothing go in one statement. Those that carry a sanction are judged against the reports about the account, found through `ReportEvidence.subjectUserId` (the only place the former id survives on a report), and deleted only when they match the `deletedAt` that was judged, so a newer deletion of the same identity is never taken with it. The floor of a full retention period after the deletion matters because suspending an account closes its member reports: measured from those alone, an account suspended months before it was deleted would come back clean soon after.

### The photo choice is required, and KEEP is the one to offer

WhatsApp leaves the media you sent with the people you sent it to, and Telegram keeps a deleted sender's messages in the group. Both treat what you share into a group as belonging to the group from that moment. An event album is that kind of place: a guest's photos of the wedding are the couple's memories as much as the guest's, and losing them because a guest tidied up their phone a year later is the surprising outcome, not the safe one.

Privacy still wins when the person asks: `?photos=DELETE` removes their uploads everywhere. Either way the _link_ between person and photo is gone, which is the part that is their personal data. The choice is stored on the row with the intent, so a resumed saga honours what the user actually chose rather than a default.

So `?photos=` is **required**, with no server-side default. Both outcomes are irreversible and they are opposites: one leaves a stranger's binaries in an album, the other destroys other people's wedding photos. A client that forgets the parameter is a bug, and the only answer that cannot be the wrong one is a 400 — deletion is retriable, a wiped album is not. The app therefore has to ask, which is also what the App Store disclosure needs: the person is told that KEEP leaves their photos in the event and only the link to them is removed. `ACCOUNT_DELETION_PHOTO_POLICY_FALLBACK` (KEEP) is not that default; it is what a _resumed_ saga uses if its row somehow carries no choice, because the reconciler has nobody left to ask.

### Events are handed over, not orphaned

Telegram leaves a channel whose owner deleted their account without an owner: admins keep working, but nobody can ever transfer or delete it. Those zombie channels are the outcome to avoid. WhatsApp instead promotes a member when the last admin leaves, and Everglow does the same, deterministically: participants before viewers, then whoever has been a member longest. A viewer can be promoted when nobody else is left, because an organizer who cannot upload still beats an event nobody can manage. Only an event with no other member at all is deleted.

### No grace period

Facebook and Instagram hold a deleted account for 30 days and let a sign-in cancel it; WhatsApp and Telegram delete immediately. A grace period needs a pending state, a scheduler, a restore endpoint, a mobile flow to cancel, and a story for hiding the account's content for a month without breaking events for everyone else. That is a product decision with its own UI. Immediate deletion is what Apple's requirement needs, and asking about the photos removes the largest regret.

---

## 6b. Edge cases

| Case                                           | Handling                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Organises an event with another organizer      | Membership removed; event untouched                                                                                    |
| Only organizer, other members are participants | Longest-standing participant promoted                                                                                  |
| Only organizer, other members are only viewers | Longest-standing viewer promoted                                                                                       |
| Only member of the event                       | Event deleted with all its photos and its cover; S3 purged through the outbox after commit                             |
| Created an event it later left                 | `creatorId` set to null; nothing else                                                                                  |
| Uploaded photos, `?photos=KEEP`                | Kept, `addedById` null; organizers can still delete them                                                               |
| Uploaded photos, `?photos=DELETE`              | Rows deleted in prep, objects purged through the outbox after commit; their OPEN reports closed as `TARGET_GONE`, `PHOTO_DELETED` first (`reportsClosed`) |
| Reported as a member                           | OPEN member reports that aren't severe closed as `TARGET_GONE`, `ACCOUNT_DELETED` (`memberReportsClosed`); severe ones stay for the platform |
| Upload in flight                               | `PENDING` row deleted, key purged; a PUT landing later is an orphan for the S3 orphan reconciler                       |
| Has an avatar                                  | Key queued in prep, column left to the cascade, object purged after commit ([image-uploads.md](./image-uploads.md)) |
| Avatar uploaded but never confirmed            | No row ever referenced it; an orphan for the S3 orphan reconciler                                                      |
| Management credentials missing, token refused or a scope missing | 503 `ACCOUNT_DELETION_UNAVAILABLE`, nothing written; `user.account.deletion_unavailable` pages        |
| Apple identity, Sign in with Apple not configured or its key unusable | 503 `ACCOUNT_DELETION_UNAVAILABLE`, nothing written                                                |
| Prep fails                                     | 500, Auth0 untouched, flag kept; tapping Delete again resumes, the reconciler finishes it otherwise                   |
| Auth0 fails after intent                       | 500, row and flag kept; the person's retry or the reconciler calls Auth0 again, 404 counts as success                 |
| Any other request while the flag is set        | 401 `ACCOUNT_DELETION_IN_PROGRESS`; the app clears the phone as a sign-out and says the account is being deleted       |
| The person retries while the reconciler runs it | 401 `ACCOUNT_DELETION_IN_PROGRESS` (the reconciler holds the claim), or 204 if it already finished                    |
| Reconciler and a request at once               | Only the holder of the claim runs the saga; the other skips. A row deleted under a pass counts as done, never a 500   |
| Apple refuses the revocation, or has no token  | Deletion goes ahead; the last screen tells a Sign in with Apple account to remove Everglow under its Apple ID          |
| Database delete fails after Auth0              | Row kept and flagged; reconciler finishes it                                                                           |
| S3 purge fails                                 | Logged with counts; the keys stay in the outbox for the resumed saga or the reconciler; request still 204 if the rest finished |
| Pass fails after prep (Apple, Auth0, a crash)  | Prep's keys were queued in its transaction and drained before the failure; the resumed pass drains what is left        |
| Member or organizer mid-deletion, or abandoned | Left out of participant lists and never named as an invite's host                                                      |
| Any request with a pre-deletion token          | Generic 401; client signs out                                                                                          |
| Token issued within 5 minutes after the deletion | Refused like a pre-deletion one: Auth0's clock may run ahead of ours (authentication.md §6)                         |
| Same person signs in again later               | New account, new id, free tier (see authentication.md §6); suspended again and banned again if the deleted one was (§6a) |
| Suspended account deletes itself               | Allowed (`@AllowSuspended()`); the suspension waits on the tombstone for a sign-in or for the platform to lift it      |
| Suspended or banned mid-deletion               | The suspend or ban waits on the row lock, then fails because the row is gone, or lands first and is carried            |
| Event of a carried ban is deleted              | The carried ban goes with it by cascade                                                                                |
| Deletion abandoned after the attempt budget    | Reported once as `user.account.deletion_abandoned`; the row awaits a person (§4 runbook)                               |
| Two members of one event deleting at once      | Neither counts the other as cover; the event is handed to a member who is staying, or deleted if none is               |
| Two co-organizers deleting at once             | The first to run prep hands over to a staying member; the second then sees real cover and skips                        |
| Successor is promoted after their own prep ran | Cannot happen: a member mid-deletion is never chosen as successor                                                      |
| Event already deleted by a concurrent deletion | `deleteMany` makes it a no-op, and the run is not counted as a deletion                                                |
| Account with a raised storage limit            | Limit gone with the row; refunds are billing's concern                                                                 |
| Account never onboarded                        | Same flow; only the row to remove                                                                                      |
| Missing `?photos=`                             | 400, nothing deleted; the choice is required                                                                           |
| Unknown `?photos=` value                       | 400, nothing deleted                                                                                                   |

---

## 7. What we are optimizing for

1. **No JIT resurrection** of an account the user asked to delete: Auth0 stops being a live login for that identity, and the tombstone stops the tokens it already issued.
1. **Nothing irreversible before something that can fail**: the pre-flight checks Auth0 and Apple can be used before anything is written, and prep and its foreign keys come before the Auth0 call, so a failure never costs a login.
1. **A failure never strands the person**: they can ask again and the saga resumes; until it finishes, the app says the account is being deleted instead of signing them out with no reason.
1. **No false atomicity** via long DB transactions around Auth0.
1. **Detectable, finishable** leftovers when database teardown fails after Auth0.
1. **Familiar ops model** aligned with photo orphan reconciliation, with order chosen for IdP risk.

Implementation details (column names, job schedule, exact prep steps) live with the users / Auth0 management code and can evolve. This document is the why.
