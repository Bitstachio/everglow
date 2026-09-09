# Account deletion

`DELETE /users/me` removes the caller's account. It always succeeds, it can be repeated, and by the time it returns the account can neither be used nor brought back by a token that is still valid. This page records what happens to everything the account touched, the alternatives that were weighed, and why the current answer was chosen.

Apple requires in-app account deletion for any app with account creation, and the answer must never dead-end: a deletion that fails because the user still organises an event is not acceptable. Until this design landed, the endpoint failed with a foreign-key violation for every active user.

---

## 1. What the account owns, and what happens to it

| Data                                             | Lives in      | On deletion                                                                                         |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------- |
| Identity (`User.providerSub`)                    | Postgres      | Row deleted. A hashed tombstone remembers _when_ (§4).                                              |
| Profile (`UserDetails`: name, email)             | Postgres      | Deleted (cascade). No name or email survives anywhere.                                              |
| Memberships (`EventAccess`)                      | Postgres      | Deleted (cascade), after the organizer rules below have run.                                        |
| Events organised alone, with nobody else in them | Postgres + S3 | Deleted, with every photo still in them.                                                            |
| Events organised alone, with other members       | Postgres      | Handed over: the longest-standing member becomes an organizer.                                      |
| Events with other organizers                     | Postgres      | Membership removed; the event is untouched.                                                         |
| `Event.creatorId` on events that survive         | Postgres      | Set to null. It is attribution, never a permission.                                                 |
| READY photos in events that survive              | Postgres + S3 | Kept in the event with no uploader (default), or deleted everywhere with `?photos=delete`.          |
| Uploads in flight (PENDING slots)                | Postgres + S3 | Discarded; whatever landed in S3 is purged.                                                         |
| Storage quota and any purchased limit            | Postgres      | Gone with the row. Kept photos count toward nobody's quota. Refunds are billing's concern.          |
| Login at the identity provider (Auth0)           | Auth0         | Untouched here; tracked in #37. A later sign-in with the same identity starts a new, empty account. |

---

## 2. The flow

Everything in Postgres happens in **one transaction**, so a crash halfway leaves either the whole account or none of it:

1. Load the account. If it is already gone, stop: the caller gets 204 either way.
2. For every event the account **organises**:
   - another organizer exists → nothing to do, the membership goes with the row;
   - no other organizer, other members exist → promote the successor (§3.2);
   - nobody else → delete the event; its photo keys are collected for the purge.
3. Delete the account's **PENDING** photo rows and collect their keys.
4. Apply the **photo policy** to the account's READY photos in the events that survive: `keep` sets `addedById` to null, `delete` removes the rows and collects the keys.
5. Write the **tombstone** (§4), then delete the `User` row. The cascades take the profile and the remaining memberships; surviving events keep their rows with `creatorId` null.

After the commit, and never inside the transaction, the collected S3 keys go to `PhotoPurgeService` (batched `DeleteObjects`, best effort). A failure there is logged and left to the daily orphan reconciler; it never fails the request. Then one audit log line, `user.account.deleted`, carries the counts.

The rows-first order is deliberate and matches event deletion (photos-architecture.md §5): once the rows are gone no member can see a photo whose object is missing and every quota is released; what remains at stake is storage cost, which has its own safety net.

---

## 3. Decisions

### 3.1 Photos in events that outlive the account: kept by default

WhatsApp leaves the media you sent with the people you sent it to. Telegram keeps your messages in the group under "Deleted Account". Both treat content shared into a group as belonging to the group from that moment. An event album is the same kind of place: a guest's photos of the wedding are the couple's memories as much as the guest's, and losing them because a guest tidied up their phone a year later would be the surprising outcome.

Google Photos does the opposite and removes a contributor's photos from shared albums, but there the photos are stored in the contributor's own account. Here, after deletion, a kept photo has no uploader and counts toward nobody's quota; it is the event's.

Privacy still wins when the person asks for it: `?photos=delete` removes their READY photos everywhere. The mobile client is expected to offer this as a choice on the deletion screen. Either way the uploader's link to the photo is gone, which is the part that is personal data of the uploader.

### 3.2 Events organised alone: handed over, or deleted when empty

Telegram leaves a channel whose owner deleted their account without an owner; admins keep working but nobody can ever transfer or delete it. That is the "zombie event" outcome and it was rejected. WhatsApp instead promotes a member at random when the only admin leaves. Everglow does the same, deterministically: participants before viewers, then whoever has been a member longest. A viewer can be promoted when nobody else is left; an organizer who cannot upload is still better than an event nobody can manage. Only an event with no other member at all is deleted, and then with all of its photos, including those of members who left earlier.

### 3.3 `creatorId` is attribution, so it becomes null

Who may manage an event is decided by `EventAccess`, never by `creatorId`; the creator only ever had rights because creation also made them an organizer. Reassigning the column to the promoted organizer would keep the contract at the cost of lying about history. Null is honest, and the client already checks `accessLevel` for permissions.

### 3.4 No grace period

Facebook, Instagram and X hold a deleted account for 30 days and let a sign-in cancel the deletion; WhatsApp and Telegram delete immediately. A grace period needs a "pending deletion" state, a scheduler for the hard delete, a restore endpoint, and a mobile flow to cancel, and while the account is pending its events and photos would have to be hidden without breaking the events for everyone else. That is a product decision with its own UI, not something to bolt onto the first working deletion. The immediate version is what Apple's requirement needs, and the kept-photos default removes the largest "I regret this" cost. A confirmation screen listing what will be lost is the mobile side's job.

### 3.5 Tokens issued before the deletion are refused; a later sign-in starts fresh

Access tokens are stateless and outlive the row they were issued for, and an unknown subject is provisioned as a new user on its first request. Without care, the app's very next request after a deletion would recreate the account. The tombstone stores the deletion time against a SHA-256 of the subject, and `UsersService.resolveByProviderSub` compares it with the token's `iat`: issued before the deletion → 401 `ACCOUNT_DELETED`; issued after → a genuine new sign-in, provisioned as a new account with a new id and the free tier, the way a deleted WhatsApp number can register again. A token with no `iat` cannot be placed in time and is refused. The subject is hashed so the table never becomes a directory of identities that asked to be forgotten. Deleting the same identity twice over time updates the one tombstone to the latest time.

### 3.6 Idempotent, and safe under concurrency

A repeat `DELETE /users/me` finds no row and returns 204. Two concurrent deletions of the same account can both pass the first read; Postgres rejects the loser's `user.delete` (or any row it was reshaping) with a not-found error, the transaction rolls back, and the service tries once more, which finds the account gone and reports success. A successor promoted for an event who is deleting their own account at the same moment is handled by their own deletion running the same rules on the next attempt.

---

## 4. Edge cases

| Case                                                   | Handling                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account organises an event with other organizers       | Membership removed by the cascade; nothing else changes.                                                                                            |
| Account is the only organizer, others are participants | Longest-standing participant becomes an organizer.                                                                                                  |
| Account is the only organizer, others are only viewers | Longest-standing viewer becomes an organizer.                                                                                                       |
| Account is the only member                             | Event deleted with all its photos; S3 purged after commit.                                                                                          |
| Account created an event it later left                 | `creatorId` becomes null; nothing else, it was not a member.                                                                                        |
| Account is a participant or viewer elsewhere           | Membership removed.                                                                                                                                 |
| READY photos in surviving events, default policy       | Kept, `addedById` null. Organizers can still delete them; no quota holds them.                                                                      |
| READY photos in surviving events, `?photos=delete`     | Rows deleted in the transaction, objects purged after commit.                                                                                       |
| Photos in events that are deleted by this call         | Gone with the event, whatever their uploader and whichever policy.                                                                                  |
| Upload in flight (single PUT or multipart)             | PENDING row deleted, key purged. A PUT that lands afterwards is an orphan for the reconciler. Open multipart uploads are aborted once #53 lands.    |
| S3 purge fails, in part or whole                       | Logged at error with counts; objects wait for the daily reconciler. The request still returns 204.                                                  |
| Second `DELETE /users/me` with the same token          | The token is refused with 401 before reaching the endpoint (§3.5).                                                                                  |
| Any other request with the old token                   | 401 `ACCOUNT_DELETED`; the client signs the user out.                                                                                               |
| Same person signs in again later                       | New account, new id, free tier, no memberships.                                                                                                     |
| Token without an `iat` claim                           | Refused if the subject has a tombstone; Auth0 always sets `iat`.                                                                                    |
| Clock skew between Auth0 and the API                   | A sign-in within a few seconds of the deletion may be refused once; signing in again works. No pre-deletion token is accepted by skew alone.        |
| Two concurrent deletions of the same account           | One wins, the other retries, finds nothing, returns 204.                                                                                            |
| Successor deletes their own account at the same time   | Whichever transaction loses is retried; the successor's own deletion applies the same rules to the event.                                           |
| Account with a raised storage limit                    | Limit gone with the row; refunds are billing's concern.                                                                                             |
| Account never onboarded (no profile)                   | Same flow; nothing to cascade but the row.                                                                                                          |
| Invalid `?photos=` value                               | 400 from validation, nothing deleted.                                                                                                               |
| Auth0 identity                                         | Not deleted here (#37). PII at the identity provider remains until that lands; the app-side data and the ability to resurrect the account are gone. |

---

## 5. Not in this design

- **Auth0 identity deletion** (#37): needs Management API credentials; the tombstone already makes the app side safe whether or not it lands.
- **Grace period with restore** (§3.4).
- **Preview endpoint** (`GET /users/me/deletion-preview` with the counts above) for a richer confirmation screen. Cheap to add once the mobile flow wants it.
- **Aborting open multipart uploads** at deletion: added with #53, which introduces them.
