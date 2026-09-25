# Moderation: reports and blocks

Everglow albums are invite-only, but the photos in them are still user-generated content. App Store guideline 1.2 asks three things of such an app: a way to **report** objectionable content, a way to **block** abusive users, and a developer who **acts on reports**. This document covers how the API does each, and what it deliberately leaves out.

Everything lives in `src/moderation/`. The `events` and `photos` modules gain only read filters:

- `PhotosService.listPhotos` and `PhotosService.findOne` apply `PhotoVisibilityService.whereVisibleTo` (§3)
- the participants list carries `isBlockedByCaller` (§4)

---

## 1. Model

```prisma
model Report {
  eventId        // CASCADE
  reporterId?    // SET NULL
  targetType     // PHOTO | MEMBER
  photoId?       // SET NULL, PHOTO reports only
  reportedUserId?// SET NULL: the reported member, or the uploader of the reported photo
  reason         // SPAM | NUDITY_OR_SEXUAL | HARASSMENT | VIOLENCE | OTHER
  note?          // VarChar(500)
  status         // OPEN | ACTIONED | DISMISSED
  resolvedById?  // SET NULL
  resolvedAt?
}

model UserBlock {
  blockerId      // CASCADE
  blockedId      // CASCADE
  @@unique([blockerId, blockedId])
}
```

### Why a target type plus two nullable keys

A report points at a photo or at a member. Both are stored as plain foreign keys, because a polymorphic `targetId` could not be a foreign key at all, and then nothing would clean up after a deleted photo.

`targetType` is stored rather than derived from which key is set, because both keys are `SET NULL`. Once the photo or the account is gone, the enum is what still says what kind of thing was reported.

`reportedUserId` is filled for **both** kinds: for a PHOTO report it is the photo's uploader at the time. That one column answers "is this report about me?" for either kind, which is what the self-report rule, the cannot-resolve-your-own rule (§2) and the organizer escalation (§5) all need.

### What happens on delete

A report never blocks a deletion, and only the event takes reports with it.

| Relation                | On delete | Why                                                                                                                      |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Report.eventId`        | `Cascade` | Reports are the event's moderation queue. With the event gone there is nobody to read them and nothing to moderate.      |
| `Report.reporterId`     | `SetNull` | A reporter deleting their account must not erase the evidence. The report stays, and still counts towards hiding.        |
| `Report.photoId`        | `SetNull` | The report stays as a record. Its OPEN reports are closed as `ACTIONED` in the same transaction, before the delete (§2). |
| `Report.reportedUserId` | `SetNull` | A reported account can be deleted like any other; what was reported about it stays in the event's queue.                 |
| `Report.resolvedById`   | `SetNull` | The verdict outlives the organizer who gave it.                                                                          |
| `UserBlock.blockerId`   | `Cascade` | A block means nothing once either side is gone.                                                                          |
| `UserBlock.blockedId`   | `Cascade` | Same.                                                                                                                    |

So account deletion needs **no prep step** for either model: `AccountDeletionPrepService` is unchanged, and `user.delete` cannot fail on a report or a block (see [account-deletion.md §6](./account-deletion.md#6-prep-making-the-row-deletable)).

### Constraints Prisma cannot express

Added by hand in the migration. Each is written so that a later `SET NULL` still passes: a comparison with `NULL` is `NULL`, and a `CHECK` only rejects `FALSE`.

| Constraint                                | Rule                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `Report_member_target_has_no_photo_check` | `targetType = 'PHOTO' OR photoId IS NULL`                                            |
| `Report_reporter_is_not_reported_check`   | `reporterId <> reportedUserId`                                                       |
| `Report_resolution_matches_status_check`  | OPEN has no `resolvedAt` and no `resolvedById`; a resolved report has a `resolvedAt` |
| `UserBlock_no_self_block_check`           | `blockerId <> blockedId`                                                             |

### One OPEN report per reporter and target

Two partial unique indexes, declared in the Prisma schema (`partialIndexes` preview feature):

```sql
UNIQUE ("reporterId", "photoId")                   WHERE status = 'OPEN'
UNIQUE ("reporterId", "eventId", "reportedUserId") WHERE status = 'OPEN' AND "targetType" = 'MEMBER'
```

They are the **only** duplicate check. `ReportsService` inserts with `skipDuplicates` (`ON CONFLICT DO NOTHING`), and when no row comes back it returns the caller's existing OPEN report. A lookup before the insert would still lose to a concurrent submission; the index cannot. Resolved reports fall outside both indexes, which is what lets the same member report the same target again later.

The photo index needs no `targetType` predicate: MEMBER reports have a null `photoId`, and nulls never collide. The member index does need it, because PHOTO reports carry the uploader in `reportedUserId` too, and reporting someone's photo must not stop you from reporting them.

### Indexes

| Index                                                             | Serves                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `(eventId, status, createdAt)`                                    | The organizer queue, and the per-event lookup of photos over the hide threshold (§3)      |
| `(reporterId, photoId) WHERE OPEN` (unique)                       | Idempotency, and "which photos has the caller an open report on?" in the photo read paths |
| `(photoId)`, `(reporterId)`, `(reportedUserId)`, `(resolvedById)` | The rows each `SET NULL` has to find when a photo or an account is deleted                |
| `UserBlock (blockerId, blockedId)` (unique)                       | Idempotency, the caller's block list, "did the caller block this uploader?"               |
| `UserBlock (blockedId)`                                           | The other direction of the symmetric filter, and the cascade                              |

---

## 2. Reports

| Endpoint                                                   | Who        | Result                                      |
| ---------------------------------------------------------- | ---------- | ------------------------------------------- |
| `POST /photos/:photoId/reports`                            | any member | 201, the caller's OPEN report on the photo  |
| `POST /events/:eventId/participants/:targetUserId/reports` | any member | 201, the caller's OPEN report on the member |
| `GET /events/:eventId/reports?status=&cursor=&limit=`      | organizers | 200, `{ items, nextCursor }`, newest first  |
| `PATCH /reports/:reportId` `{ action }`                    | organizers | 200, the resolved report                    |

The target is in the route, so both `POST`s share one body: `{ reason, note? }`.

Rules:

- **Any member may report**, viewers included. Authorization is CASL (`reports.abilities.ts`): `create` for members filing in their own name, `read` and `update` for organizers of the report's event.
- **Not yourself**, and not your own photo: 403.
- **The photo must be visible to the reporter.** A photo they cannot see (a blocked uploader, or one already hidden from everyone) is a 404, exactly as `GET /photos/:photoId` would answer. The one exception is a photo hidden by their own OPEN report: that is a repeat, and it gets the report back.
- **Repeats are idempotent.** While the caller's earlier report on the same target is OPEN, `POST` returns that report with 201 and creates nothing. The reason and note of the first submission stand.
- **Reporters are anonymous to organizers.** `ReportResponseDto` has no `reporterId`. In a small event an organizer who learns who reported them can retaliate; the id stays in the database and in the audit log (§5) for the platform owner.
- **Organizers see who uploaded a reported photo, never who reported it.** `reportedUserId` is the uploader (or the reported member); there is no reporter field.
- **Resolving is an action, not a label.** The organizer says what to do, and the API does it and records the verdict in one transaction:

  | `action`        | What it does                                                                               | Every OPEN report on the target becomes |
  | --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- |
  | `REMOVE_PHOTO`  | Deletes the reported photo. Photo reports only; on a member report it is a 400.            | `ACTIONED`                              |
  | `REMOVE_MEMBER` | Removes the reported member from the event, and for a photo report deletes that photo too. | `ACTIONED`                              |
  | `DISMISS`       | Nothing. The content stays, and a photo hidden by its reports is back.                     | `DISMISSED`                             |

  "The target" is the photo for a photo report, the member for a member report, and for `REMOVE_MEMBER` everything reported about that member in the event, photos included. One verdict closes them all, so a photo reported by five people is one decision, not five. A report whose target has since been deleted closes just itself.

- **Deleting a photo closes its reports.** However a photo goes (`DELETE /photos/:photoId` by its uploader or an organizer, an organizer's `REMOVE_PHOTO`, or account deletion with `?photos=DELETE`), its OPEN reports become `ACTIONED` in the same transaction, resolved by whoever deleted it (`closeReportsOnDeletedPhotos`). There is nothing left to judge, and a report whose photo is gone could otherwise only be dismissed by hand, or by nobody when the uploader is the event's only organizer. `photo.deleted` logs `uploaderId` and `closedReports`, so an organizer deleting a photo reported against them stays visible in the audit log; the report was already escalated when it was filed (§5).
- **A removal needs something to remove.** `REMOVE_PHOTO` when the photo is already gone, or `REMOVE_MEMBER` when the account is gone, is a 422; `DISMISS` closes such a report. The photo's S3 object is deleted after the transaction commits. If that fails the call still succeeds, a `report.photo_object_retained` warning is logged, and the orphan reconciler removes the object later.
- **An organizer cannot resolve a report about themselves** or about their own photo: 403. Another organizer has to. If there is none, the report stays OPEN, which is one reason such reports are escalated at creation (§5).
- **A report is resolved once.** The update is guarded on `status = OPEN`; a second verdict, including one racing the first, gets 409 and removes nothing.
- The list uses the same keyset pagination as the photo list (`src/common/pagination`).

---

## 3. Hiding reported photos

Hiding is a **filter in the photo read paths**. `PhotoStatus` is untouched and nothing is deleted, so every hide is undone by resolving the reports.

1. **A photo is hidden from its reporter at once**, for as long as that report is OPEN.
2. **A photo is hidden from everyone except the event's organizers** once its OPEN reports reach the event's threshold:

   | Members in the event (uploader included) | OPEN reports that hide a photo          |
   | ---------------------------------------- | --------------------------------------- |
   | 4 or more                                | `REPORT_HIDE_THRESHOLD` = 3             |
   | 3 or fewer                               | `SMALL_EVENT_REPORT_HIDE_THRESHOLD` = 2 |

   Three keeps one member, or a pair acting together, from taking a photo down for the whole event. An event with fewer than three members besides the uploader could never collect three, so two are enough there. It is never one. In an event of two only rule 1 can apply, and the organizer sees the report.

   One OPEN report per reporter is enforced by the database (§1), so counting rows is counting distinct reporters.

3. **A photo is hidden from everyone except the event's organizers after one OPEN report for a severe reason** (`NUDITY_OR_SEXUAL` or `VIOLENCE`, `SEVERE_REPORT_REASONS`). Leaving such a photo up while it collects more reports costs more than hiding a harmless one until an organizer looks. The report is escalated at once as well (§5).
4. **Resolving restores.** A verdict closes every OPEN report on the photo (§2). `DISMISS` brings the photo back for everyone, reporters included; `REMOVE_PHOTO` and `REMOVE_MEMBER` delete it, so there is nothing to restore.

"Everyone" includes the uploader. Organizers always see the photo, because they are the ones who have to look at it.

The threshold is evaluated when photos are read, not stored on the photo. Members joining or leaving can move an event across the 3/4 boundary, and a stored flag would then be stale.

### The shared filter

`PhotoVisibilityService.whereVisibleTo(callerId, event)` returns one `Prisma.PhotoWhereInput`, and it is the only place these rules exist:

```ts
{} // for an organizer of the event

{
  AND: [
    { reports: { none: { reporterId: callerId, status: OPEN } } },                  // rule 1
    { reports: { none: { status: OPEN, reason: { in: SEVERE_REPORT_REASONS } } } }, // rule 3
    { id: { notIn: photoIdsOverThreshold } },                                       // rule 2
    { NOT: { addedBy: { is: { OR: [blockedByCaller, blockedTheCaller] } } } }, // blocks, §4
  ],
}
```

- `listPhotos` ANDs it into the page query, next to `READY`, the CASL filter and the cursor.
- `findOne` asks `isVisibleTo(photoId, …)`, which is the same filter narrowed to one id. A photo missing from the list is therefore a 404 on its own, and the two cannot drift apart. Membership is still checked first, so a non-member gets 403 as before.
- `ReportsService.reportPhoto` uses `isVisibleTo` as well (§2).

Both callers load the event with `eventForPhotoVisibilityInclude(callerId)`, which brings the caller's membership and the member count along with the row they were loading anyway.

Cost for a non-organizer: **one** extra query per call, a `GROUP BY photoId … HAVING count(*) >= threshold` over the event's OPEN reports on `(eventId, status, createdAt)`. It returns the handful of photos currently waiting for an organizer, not a row per photo. Rules 1 and 3 and the blocks are subqueries inside the photo query, answered by `(reporterId, photoId) WHERE OPEN` and the two `UserBlock` indexes. There is no per-row query. Organizers pay nothing.

---

## 4. Blocks

| Endpoint                          | Result                                                    |
| --------------------------------- | --------------------------------------------------------- |
| `PUT /users/me/blocks/:userId`    | 200, `{ userId, name, username, blockedAt }`              |
| `DELETE /users/me/blocks/:userId` | 204                                                       |
| `GET /users/me/blocks`            | 200, `{ items: [{ userId, name, username, blockedAt }] }` |

- **Only someone you share an event with.** Anyone else gets the same 404 as a user id that does not exist, so the endpoint cannot be used to find out which ids are real. Blocking yourself is a 403.
- **Both writes are idempotent.** Blocking twice returns the existing block (`ON CONFLICT DO NOTHING` on the unique pair, so two requests at once leave one row); unblocking someone who is not blocked is a 204.
- **Silent.** The blocked user is never notified, no response of theirs changes shape, and no error tells them apart from anyone else.
- **Symmetric in effect.** Photos uploaded by someone I blocked are gone from my list and single reads in every event, and mine are gone from theirs. A photo whose uploader's account was deleted (`addedById` null) matches no block.
- **Organizers are exempt in the events they organize.** They see every photo there, whoever blocked whom, because they have to moderate. The same person in an event they do not organize is filtered like anyone else.
- **Nobody is removed from anything.** Both users stay members, both can upload, and third parties see the photos of both. Removing a member is an organizer's decision, not a side effect of a block.
- **Both still see each other in the members list.** Hiding membership would confuse organizers and would leak anyway through member counts and other members' photos. The row is marked instead (next point), which is how Discord and WhatsApp treat blocked people in shared groups.
- **The participants list marks who I blocked.** Each row of `GET /events/:eventId/participants` has `isBlockedByCaller`, so the client can offer to unblock. It is loaded in the same query as the roster, and only ever from `blocksReceived WHERE blockerId = caller`: nothing in the API reveals who has blocked the caller.

### Joining an event across a block

`POST /events/join` checks blocks between the joiner and the event's **organizers** (any organizer, not only the creator), in both directions, in one query:

| Situation                                            | Result                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An organizer blocked the joiner                      | **404**, the same `Event with invitation URL "…" not found` as a link that does not exist. The block is never revealed to the person blocked                                                                            |
| The joiner blocked an organizer                      | **403** with `code: ORGANIZER_BLOCKED_BY_CALLER` and "This event is organized by … you blocked. Unblock them to join." The joiner made the block, so explaining it reveals nothing, and the client can offer to unblock |
| Both blocked each other                              | 404, as in the first row                                                                                                                                                                                                |
| The joiner and an ordinary member blocked each other | Joins normally; the photo filter keeps the two apart                                                                                                                                                                    |

Existing memberships are not changed when a block happens later; an organizer who wants a blocked member out uses remove-member.

- Reports and blocks are independent. A blocked user can still be reported, and reporting does not block.

---

## 5. Escalation to the platform owner

Organizers moderate their own events, but the platform owner has to be able to act when they do not, or when they are the problem. There is no admin endpoint yet (§8), so escalation is **log-based**: alerting keys off stable event names.

| Event                                      | Level  | When                                                 | Fields                                                                                                                                                              |
| ------------------------------------------ | ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.created`                           | `info` | every new report                                     | `reportId`, `eventId`, `callerId`, `targetType`, `photoId`, `reportedUserId`, `reason`, `audit`                                                                     |
| `report.escalated`                         | `warn` | a new report that needs a human                      | the same, plus `escalationReasons`                                                                                                                                  |
| `report.resolved`                          | `info` | an organizer's verdict                               | `reportId`, `eventId`, `callerId`, `targetType`, `photoId`, `reportedUserId`, `action`, `resolution`, `closedReports`, `removedPhotoId`, `removedMemberId`, `audit` |
| `report.stale`                             | `warn` | hourly, while any report has been OPEN over 24 hours | `stale` (the count), `reportIds` and `eventIds` of the 20 oldest, `oldestCreatedAt`, `audit`                                                                        |
| `user.block.created`, `user.block.removed` | `info` | the block list changed                               | `callerId`, `blockedUserId`, `audit`                                                                                                                                |

**`report.escalated` and `report.stale` are the alerts** (tickets, see [alerting.md §3](./alerting.md#3-events-to-alert-on)); the rest are audit records. `report.stale` catches the organizer who does not act: `StaleReportCheckScheduler` runs every hour (`STALE_REPORT_AFTER_HOURS` = 24) with the usual `report.stale_check.run_completed` / `run_failed` heartbeat. `escalationReasons` holds one or more of:

| Reason                     | Meaning                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `severe_reason`            | The reason is `NUDITY_OR_SEXUAL` or `VIOLENCE` (`SEVERE_REPORT_REASONS`). A photo report of this kind also hides the photo (§3). |
| `target_is_organizer`      | The reported member, or the uploader of the reported photo, organizes the event and cannot judge it themselves.                  |
| `target_is_sole_organizer` | Added to `target_is_organizer` when they are the event's only organizer, so no one in the event can resolve it.                  |
| `hide_threshold_reached`   | This report is the one that hid the photo from the event. It stays hidden until an organizer resolves it.                        |

A repeat that returns an existing report logs nothing, so each report is announced once. Only ids and enum values are logged. The `note` is free text written by a user and is never logged ([logging-conventions.md §3](./logging-conventions.md#3-redaction--pii-the-non-negotiable-rule)).

---

## 6. Terms acceptance

Guideline 1.2 also wants users to agree to terms that forbid objectionable content. `POST /users/me/onboarding` accepts an optional `acceptedTerms: true`; when present, `User.termsAcceptedAt` is set, and `GET /users/me` returns it (null otherwise). Any value other than `true` is a 400.

The request field is optional only so the current mobile onboarding keeps working; it should become required once the app sends it. The response field `termsAcceptedAt` is already required and nullable in the OpenAPI schema, since the API always returns it.

---

## 7. Rate limiting

The five mutations (`POST /photos/:photoId/reports`, `POST /events/:eventId/participants/:targetUserId/reports`, `PATCH /reports/:reportId`, `PUT /users/me/blocks/:userId`, `DELETE /users/me/blocks/:userId`) carry `@RateLimit("sensitive")`: 10 a minute per user, on top of the global default. The two list endpoints stay on the global default. See [rate-limiting.md](./rate-limiting.md).

---

## 8. Out of scope

- **An admin dashboard or admin endpoint.** The platform owner works from the logs and the database for now.
- **Notifications.** Organizers should hear about new reports and hidden photos, and uploaders only when their photo is removed; reporters are not told the outcome. Tracked in the Notifications project in Linear.
- **Automatic removal.** No number of reports deletes a photo or removes a member; hiding is the strongest automatic effect, and deleting is always an organizer's `action`.
- **Content scanning** (hashes, classifiers) at upload.
- **Hiding members.** A block filters photos. The blocked member still appears in the participants list, flagged for the blocker.
- **An appeal flow** for the uploader of a hidden photo.
