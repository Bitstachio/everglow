# Moderation: reports and blocks

Everglow albums are invite-only, but the photos in them are still user-generated content. App Store guideline 1.2 and Google Play's User Generated Content policy ask the same things of such an app:

- users accept terms that forbid objectionable content and abusive users;
- they can **report** content and users;
- they can **block** abusive users;
- objectionable content is **filtered** before it is posted;
- the **developer acts on reports**, in a timely way.

Since June 2026, guideline 1.2 says outright that removing violating content is the developer's responsibility. Rejections in practice expect action within 24 hours.

This document is the design we are building toward. Most of it is built. The parts that aren't are marked **Planned**, with their issue. Launch is Canada and the US only. The legal duties covered here are US and Canadian ones: NCMEC reporting, the TAKE IT DOWN Act, Canada's mandatory reporting act, PIPEDA and Quebec Law 25. EU and UK rules (the DSA, the Online Safety Act) come in when those markets open.

Everything lives in `api/src/moderation/`. The `events` and `photos` modules gain only read filters:

- `PhotosService.listPhotos` and `PhotosService.findOne` apply `PhotoVisibilityService.whereVisibleTo` (§5)
- the participants list carries `isBlockedByCaller` (§6)

## Built and planned

| Part                                                                                                           | Status                  | Issue                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reports on photos, members and events; hiding; blocks; bans; under review; terms; rate limits                  | Built                   | [EV-7](https://linear.app/mehrshadfb/issue/EV-7), [EV-38](https://linear.app/mehrshadfb/issue/EV-38), [EV-56](https://linear.app/mehrshadfb/issue/EV-56), [EV-11](https://linear.app/mehrshadfb/issue/EV-11) |
| Two queues: where a report starts, what moves it to the platform, who may close it (§3)                        | Built                   | [EV-114](https://linear.app/mehrshadfb/issue/EV-114)                                                                                                                                                         |
| Report history: reports outlive their event, and record why and by whom they closed (§1, §3)                   | Built, replaces PR #142 | [EV-60](https://linear.app/mehrshadfb/issue/EV-60)                                                                                                                                                           |
| Deletes wait for moderation: an event with OPEN reports or under review can't be deleted (§7)                  | Built                   | [EV-106](https://linear.app/mehrshadfb/issue/EV-106)                                                                                                                                                         |
| Evidence snapshots, quarantine instead of purge, retention and holds (§7)                                      | Built                   | [EV-61](https://linear.app/mehrshadfb/issue/EV-61)                                                                                                                                                           |
| `CHILD_SAFETY` and `NON_CONSENSUAL_INTIMATE_IMAGE` reasons; NCMEC, Canada and TAKE IT DOWN procedures (§2, §7) | Planned                 | [EV-62](https://linear.app/mehrshadfb/issue/EV-62); the TAKE IT DOWN part is filed once this design is agreed                                                                                                |
| Platform tools: act on any report, suspend accounts and events, lift reviews (§8)                              | Planned                 | [EV-58](https://linear.app/mehrshadfb/issue/EV-58), [EV-59](https://linear.app/mehrshadfb/issue/EV-59); account suspension is filed once this design is agreed                                               |
| Upload screening (§11)                                                                                         | Planned                 | Filed once this design is agreed                                                                                                                                                                             |
| Telling organizers about reports and uploaders about removals                                                  | Planned                 | [EV-33](https://linear.app/mehrshadfb/issue/EV-33)                                                                                                                                                           |

## Who moderates

**Organizers moderate their own event first.** They know the guests, and most reports in a wedding album are a spam photo or a falling-out between friends.

**The platform can act on any report at any time.** It is the only one who acts when an organizer can't judge fairly or can't see the content:

- the report is about an organizer;
- the report is about the event itself;
- the gallery has closed;
- the report is for child safety or an intimate image;
- organizers left it for 24 hours.

A report that reaches the platform never goes back to organizers.

---

## 1. Model

```prisma
model Report {
  eventId?           // SET NULL
  eventTitle         // the event's title when the report was filed
  reporterId?        // SET NULL; null from the start on an automated report (§11)
  source             // USER | AUTOMATED (planned, §11)
  targetType         // PHOTO | MEMBER | EVENT
  photoId?           // SET NULL, PHOTO reports only
  reportedUserId?    // SET NULL: the reported member, or the uploader of the reported photo
  reason             // SPAM | NUDITY_OR_SEXUAL | HARASSMENT | VIOLENCE | OTHER
                     //   + CHILD_SAFETY | NON_CONSENSUAL_INTIMATE_IMAGE (planned, EV-62)
  note?              // VarChar(500)
  queue              // ORGANIZERS | PLATFORM (§3)
  escalationReasons  // ReportEscalation[]: why it reached the platform, logged lowercase (§9)
  escalatedAt?       // when it moved to PLATFORM, or was filed there
  overdueAlertedAt?  // when the platform was told it is overdue (§9)
  status             // OPEN | ACTIONED | DISMISSED | TARGET_GONE
  closedReason?      // why it closed (§3)
  closedByRole?      // ORGANIZER | PLATFORM | SUBJECT | SYSTEM (§3)
  resolvedById?      // SET NULL
  resolvedAt?
  holdUntil?         // the purge skips it until then
  holdReason?        // CHILD_SAFETY | INTIMATE_IMAGE | LAW_ENFORCEMENT | LEGAL
  authorityReference? // CyberTipline or police reference number (planned, EV-62)
}

model ReportEvidence {  // one per report, written when the report is filed
  reportId            // CASCADE: it lives as long as its report
  objectS3Key?        // the photo, or the event's cover; no foreign key
  contentType?, sizeBytes?
  evidenceS3Key?      // the quarantined copy under evidence/ (§7)
  sha256?             // of the copy, computed by S3 while copying
  quarantinedAt?, quarantineFailedAt?
  subjectUserId?      // no foreign key: kept after the account is deleted
  subjectUsername?
}

model UserBlock {
  blockerId      // CASCADE
  blockedId      // CASCADE
  @@unique([blockerId, blockedId])
}
```

### Why a target type plus two nullable keys

A report points at a photo, at a member or at the event. They are stored as plain foreign keys, because a polymorphic `targetId` could not be a foreign key at all, and then nothing would clean up after a deleted photo.

`targetType` is stored rather than derived from which key is set, because the keys are `SET NULL`. Once the photo or the account is gone, the enum is what still says what kind of thing was reported.

`reportedUserId` is filled for both PHOTO and MEMBER reports: for a PHOTO report it is the photo's uploader at the time. That one column answers "is this report about me?" for either kind. That's what these rules need:

- the self-report rule (§2);
- routing a report about an organizer to the platform (§3);
- the rule that you can't close a report about yourself (§3).

### Why the status, a closed reason and a role

`status` is what lists filter on. `closedReason` says exactly what happened, and `closedByRole` says in which capacity the closer acted (§3). Keeping them apart answers questions the old `ACTIONED` could not:

- **Did an organizer remove the photo, or did its uploader delete it to escape the report?** `PHOTO_REMOVED` by `ORGANIZER`, against `PHOTO_DELETED` by `SUBJECT`.
- **How many verdicts has this account had against it?** Count `ACTIONED` only. `TARGET_GONE` is not a verdict.
- **Which closures were the platform's?** `closedByRole = PLATFORM`. The same person can be an organizer in one event and a platform moderator.

`resolvedById` is the person and is nulled with their account; `closedByRole` survives it.

### What happens on delete

| Relation                  | On delete | Why                                                                                                                                                                                           |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Report.eventId`          | `SetNull` | Reports are the only lasting record of abuse. An event with OPEN reports can't be deleted (§7), so only closed reports outlive their event, and `eventTitle` still says where they came from. |
| `Report.reporterId`       | `SetNull` | A reporter deleting their account must not erase the evidence. The report stays, and still counts towards hiding.                                                                             |
| `Report.photoId`          | `SetNull` | The report stays as a record, and its `ReportEvidence` keeps the content (§7). What happens to its OPEN reports depends on who deleted the photo (§3).                                        |
| `Report.reportedUserId`   | `SetNull` | A reported account can be deleted like any other. `ReportEvidence` keeps who it was for the retention window (§7).                                                                            |
| `Report.resolvedById`     | `SetNull` | The verdict outlives the person who gave it; `closedByRole` still says in which capacity.                                                                                                     |
| `ReportEvidence.reportId` | `Cascade` | Evidence lives exactly as long as its report: both are purged together after the retention window (§7).                                                                                       |
| `UserBlock.blockerId`     | `Cascade` | A block means nothing once either side is gone.                                                                                                                                               |
| `UserBlock.blockedId`     | `Cascade` | Same.                                                                                                                                                                                         |

Account deletion is never refused because of a report or a block, and `AccountDeletionPrepService` needs no extra prep for them ([account-deletion.md §6](./account-deletion.md#6-prep-making-the-row-deletable)). What it does with a sole organizer's event that still has OPEN reports is in §7.

### Constraints Prisma cannot express

Added by hand in the migrations. Each is written so that a later `SET NULL` still passes: a comparison with `NULL` is `NULL`, and a `CHECK` only rejects `FALSE`.

| Constraint                                | Rule                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Report_member_target_has_no_photo_check` | `targetType = 'PHOTO' OR photoId IS NULL`                                                                                      |
| `Report_reporter_is_not_reported_check`   | `reporterId <> reportedUserId`                                                                                                 |
| `Report_resolution_matches_status_check`  | OPEN has no `resolvedAt` and no `resolvedById`; a closed report has a `resolvedAt`                                             |
| `Report_closure_matches_status_check`     | OPEN has no `closedReason` and no `closedByRole`; a closed report has both, or neither if it closed before they were recorded  |
| `Report_user_source_has_reporter_check`   | Planned. `source = 'AUTOMATED' OR reporterId IS NOT NULL` at insert (a trigger, not a CHECK, since `SET NULL` must still pass) |
| `UserBlock_no_self_block_check`           | `blockerId <> blockedId`                                                                                                       |

### One OPEN report per reporter and target

Three partial unique indexes, declared in the Prisma schema (`partialIndexes` preview feature):

```sql
UNIQUE ("reporterId", "photoId")                   WHERE status = 'OPEN'
UNIQUE ("reporterId", "eventId", "reportedUserId") WHERE status = 'OPEN' AND "targetType" = 'MEMBER'
UNIQUE ("reporterId", "eventId")                   WHERE status = 'OPEN' AND "targetType" = 'EVENT'
```

They are the **only** duplicate check. `ReportsService` inserts with `skipDuplicates` (`ON CONFLICT DO NOTHING`), and when no row comes back it returns the caller's existing OPEN report. A lookup before the insert would still lose to a concurrent submission; the index cannot. Closed reports fall outside the indexes, which is what lets the same member report the same target again later.

The photo index needs no `targetType` predicate: MEMBER reports have a null `photoId`, and nulls never collide. The member index does need it, because PHOTO reports carry the uploader in `reportedUserId` too, and reporting someone's photo must not stop you from reporting them. Automated reports have a null `reporterId`, so they never collide either.

### Indexes

| Index                                                             | Serves                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `(eventId, status, createdAt)`                                    | The organizer queue, and the per-event lookup of photos over the hide threshold (§5)      |
| `(queue, status, escalatedAt)`                                    | The platform queue, oldest first, and the overdue check (§9)                              |
| `(reporterId, photoId) WHERE OPEN` (unique)                       | Idempotency, and "which photos has the caller an open report on?" in the photo read paths |
| `(photoId)`, `(reporterId)`, `(reportedUserId)`, `(resolvedById)` | The rows each `SET NULL` has to find when a photo or an account is deleted                |
| `(status, resolvedAt)`                                            | The retention purge (§7); holds are checked per row                                       |
| `UserBlock (blockerId, blockedId)` (unique)                       | Idempotency, the caller's block list, "did the caller block this uploader?"               |
| `UserBlock (blockedId)`                                           | The other direction of the symmetric filter, and the cascade                              |

---

## 2. Filing a report

| Endpoint                                                   | Who        | Result                                      |
| ---------------------------------------------------------- | ---------- | ------------------------------------------- |
| `POST /photos/:photoId/reports`                            | any member | 201, the caller's OPEN report on the photo  |
| `POST /events/:eventId/participants/:targetUserId/reports` | any member | 201, the caller's OPEN report on the member |
| `POST /events/:eventId/reports`                            | any member | 201, the caller's OPEN report on the event  |
| `GET /events/:eventId/reports?status=&cursor=&limit=`      | organizers | 200, `{ items, nextCursor }`, newest first  |
| `PATCH /reports/:reportId` `{ action }`                    | organizers | 200, the closed report                      |

The target is in the route, so all three `POST`s share one body: `{ reason, note? }`. The platform's endpoints are in §8.

### Reasons

| Reason                                    | Severe | Starts in                               | Hides the photo or cover from                                            |
| ----------------------------------------- | ------ | --------------------------------------- | ------------------------------------------------------------------------ |
| `SPAM`, `HARASSMENT`, `OTHER`             | no     | ORGANIZERS                              | the reporter; everyone but organizers once enough members report it (§5) |
| `NUDITY_OR_SEXUAL`, `VIOLENCE`            | yes    | ORGANIZERS, and the platform is alerted | everyone but organizers, at once                                         |
| `CHILD_SAFETY` (planned)                  | yes    | PLATFORM                                | **everyone, organizers included**, at once                               |
| `NON_CONSENSUAL_INTIMATE_IMAGE` (planned) | yes    | PLATFORM                                | **everyone, organizers included**, at once                               |

- **`CHILD_SAFETY`** is for anything that sexualizes or endangers a minor. It is valid on all three targets: a photo, a member (for grooming), or the event (for its cover). It is kept apart from `NUDITY_OR_SEXUAL` because the law treats it apart: US providers must report apparent child sexual abuse material to NCMEC, and Canadian ones to Cybertip.ca and the police (§7).
- **`NON_CONSENSUAL_INTIMATE_IMAGE`** is "an intimate image of me, shared without my consent". It is what the TAKE IT DOWN Act's 48-hour removal applies to (§7). It is valid on a photo or the event's cover. On a member report it is a 400, since there is no image.
- **Organizers never see a `CHILD_SAFETY` or `NON_CONSENSUAL_INTIMATE_IMAGE` report**, nor the photo it is about. Looking at the image is the platform's job, not a wedding host's. The organizer may also be the person who posted it.

`SEVERE_REPORT_REASONS` gains the two new reasons. `PLATFORM_ONLY_REASONS` is the new set of the two.

### Rules

- **Any member may report**, viewers included. Authorization is CASL (`api/src/moderation/reports.abilities.ts`): `create` for members filing in their own name, `read` and `update` for organizers on the reports they may see and close (§3).
- **Not yourself**, and not your own photo: 403 `CANNOT_REPORT_SELF`. A member report of someone who isn't a member (anymore) is 403 `TARGET_NOT_A_MEMBER`.
- **The photo must be visible to the reporter.** A photo they cannot see (a blocked uploader, or one already hidden from everyone) is a 404, exactly as `GET /photos/:photoId` would answer. The one exception is a photo hidden by their own OPEN report: that is a repeat, and it gets the report back.
- **Repeats are idempotent.** While the caller's earlier report on the same target is OPEN, `POST` returns that report with 201 and creates nothing. The reason and note of the first submission stand.
- **Reporters are anonymous to organizers.** `ReportResponseDto` has no `reporterId`. In a small event an organizer who learns who reported them can retaliate; the id stays in the database and in the audit log (§9) for the platform.
- **Organizers see who uploaded a reported photo, never who reported it.** `reportedUserId` is the uploader (or the reported member); there is no reporter field.
- **Reporting is allowed after the gallery closes**, for members and the event. Photos can't be reported then, since none can be seen (§5).
- The list uses the same keyset pagination as the photo list (`api/src/common/pagination`).

---

## 3. Who handles a report

Built ([EV-114](https://linear.app/mehrshadfb/issue/EV-114)), except the reasons and the screening that are still planned (§2, §11). The routing is `ReportsService.createReport`; the moves are `escalateToPlatform` (`api/src/moderation/report-escalation.ts`), called from the hourly check, the gallery close job, a severe dismissal, a promotion and the delete paths.

### Where a report starts

A report starts in `PLATFORM` when any of these hold at filing, and in `ORGANIZERS` otherwise. Each sets an escalation reason (§9).

| Condition                                                         | Escalation reason     |
| ----------------------------------------------------------------- | --------------------- |
| The reason is `CHILD_SAFETY`                                      | `child_safety`        |
| The reason is `NON_CONSENSUAL_INTIMATE_IMAGE`                     | `intimate_image`      |
| It is about the event itself                                      | `target_is_event`     |
| The reported member, or the photo's uploader, organizes the event | `target_is_organizer` |
| The gallery has closed                                            | `gallery_closed`      |
| It came from upload screening                                     | `automated_flag`      |

A severe report (`NUDITY_OR_SEXUAL`, `VIOLENCE`) starts in `ORGANIZERS`, so a host can take it down at once. The platform is alerted all the same (`severe_reason`), because Apple expects the developer to act within 24 hours either way.

### What moves a report to the platform

A report in `ORGANIZERS` moves to `PLATFORM` when any of these happen. `escalatedAt` is set and the reason is appended. It never moves back.

| Event                                                                              | Escalation reason     |
| ---------------------------------------------------------------------------------- | --------------------- |
| It has been OPEN for 24 hours (`ORGANIZER_RESPONSE_HOURS`), checked hourly         | `organizer_timeout`   |
| The gallery closes. Organizers can no longer see the photo, so they can't judge it | `gallery_closed`      |
| An organizer dismisses it and its reason is severe                                 | `severe_dismissed`    |
| The reported member is promoted to organizer                                       | `target_is_organizer` |
| The reported photo is deleted without a verdict and the report is severe (below)   | `target_deleted`      |
| The reported account is deleted and the report is severe (below)                   | `target_deleted`      |

The gallery-close move happens in the close job, in the same pass that marks the gallery closed.

### Who may close a report

| Queue        | Who may close it                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `ORGANIZERS` | Any organizer of the event who is neither the reported member or uploader nor the reporter. The platform. |
| `PLATFORM`   | The platform only.                                                                                        |

- **Not the subject.** An organizer cannot close a report about themselves or their own photo: 403 `CANNOT_RESOLVE_OWN_REPORT`. Such reports start in `PLATFORM` anyway. The rule is the backstop for a report filed before its subject became an organizer.
- **Not the reporter.** A reporter who is later promoted can't close their own report: 403 `CANNOT_RESOLVE_OWN_REPORT`. Another organizer has to.
- **A member who isn't an organizer** gets 403 `ORGANIZER_ONLY`, for listing reports too (built).
- **A `PLATFORM` report** answers 403 `REPORT_ESCALATED` to an organizer's `PATCH`.

**What organizers see.** `GET /events/:eventId/reports` lists the event's PHOTO and MEMBER reports in both queues, each with its `queue`. Reports in `PLATFORM` are read-only for organizers, so they know the platform has them. Two kinds are never listed: reports about the event itself (built), and reports with a reason in `PLATFORM_ONLY_REASONS`.

### Verdicts

Closing a report is an action, not a label (built). The closer says what to do, and the API does it and records the outcome in one transaction:

| `action`        | What it does                                                                                                                                                                                | Closes as                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `REMOVE_PHOTO`  | Deletes the reported photo. Photo reports only; on a member report it is a 400.                                                                                                             | `ACTIONED`, `PHOTO_REMOVED`  |
| `REMOVE_MEMBER` | Removes the reported member from the event and bans them from rejoining (§6), and for a photo report deletes that photo too. `photos: DELETE` also deletes their other photos in the event. | `ACTIONED`, `MEMBER_REMOVED` |
| `DISMISS`       | Nothing. The content stays, and a photo hidden by its reports is back. A severe report moves to the platform instead of closing.                                                            | `DISMISSED`, `DISMISSED`     |

The platform has these and more (§8).

- **One verdict closes every OPEN report on the target that the closer may close.** "The target" is the photo for a photo report, the member for a member report, and for `REMOVE_MEMBER` everything reported about that member in the event, photos included. So a photo reported by five people is one decision, not five (built).
  - A removal by an organizer leaves the target's `PLATFORM` reports OPEN. The photo is gone and its evidence is kept (§7), and the platform still reviews, for example to report to NCMEC.
  - A dismissal by an organizer closes only non-severe `ORGANIZERS` reports. Severe ones move to `PLATFORM`.
- **A report is closed once.** The update is guarded on `status = OPEN`. A second verdict, including one racing the first, gets 409 `REPORT_ALREADY_RESOLVED` and removes nothing (built).
- **A removal needs something to remove.** `REMOVE_PHOTO` when the photo is gone, or `REMOVE_MEMBER` when the account is gone, is a 422 (`REPORTED_PHOTO_GONE`, `REPORTED_MEMBER_GONE`) (built). Today a dismissal closes such a report. Once evidence is kept, these close without a verdict instead (below).
- The photo's S3 object is deleted after the transaction commits, once its evidence copy exists (§7). If the delete fails, the call still succeeds, a `report.photo_object_retained` warning is logged, and the orphan reconciler removes the object later (built).

### Closing without a verdict

Some reports close because their target went away, not because anyone judged them. They close as `TARGET_GONE` and never count as a verdict.

- **A reported photo is deleted** by any path: `DELETE /photos/:photoId`, leaving or removal with `photos=DELETE`, or account deletion with `?photos=DELETE`.
  - **If the person deleting may close every OPEN report on it, the delete is that verdict.** For example, an organizer deleting someone else's reported photo closes its reports as `PHOTO_REMOVED` by `ORGANIZER`, as `REMOVE_PHOTO` would.
  - **Otherwise the evidence is kept (§7).** Non-severe `ORGANIZERS` reports close as `TARGET_GONE`, `PHOTO_DELETED`, by `SUBJECT` when the uploader deleted it and by `ORGANIZER` or `SYSTEM` otherwise. Every other OPEN report stays open, moves to `PLATFORM` (`target_deleted`), and is judged on its evidence. Deleting a photo hides it from everyone; it doesn't make a serious report go away.
  - `closeReportsOnDeletedPhotos` (`api/src/moderation/report-closure.ts`) decides this per photo, inside the transaction that deletes it.
- **A reported member's account is deleted.** Their non-severe MEMBER reports close as `TARGET_GONE`, `ACCOUNT_DELETED`, by `SYSTEM`. Severe ones stay open and move to `PLATFORM`. Their PHOTO reports follow the photos: with `KEEP` nothing changes, and with `DELETE` the rule above applies.

### How a report closes

| `closedReason`      | `status`      | `closedByRole`                   | Meaning                                                          |
| ------------------- | ------------- | -------------------------------- | ---------------------------------------------------------------- |
| `PHOTO_REMOVED`     | `ACTIONED`    | `ORGANIZER`, `PLATFORM`          | Someone who may judge it removed the photo                       |
| `MEMBER_REMOVED`    | `ACTIONED`    | `ORGANIZER`, `PLATFORM`          | The member was removed from the event and banned from it         |
| `ACCOUNT_SUSPENDED` | `ACTIONED`    | `PLATFORM`                       | The account was suspended everywhere (§8)                        |
| `EVENT_SUSPENDED`   | `ACTIONED`    | `PLATFORM`                       | The event was suspended (§8)                                     |
| `EVENT_DELETED`     | `ACTIONED`    | `PLATFORM`                       | The platform deleted the event as its verdict on an event report |
| `DISMISSED`         | `DISMISSED`   | `ORGANIZER`, `PLATFORM`          | Judged and left as it is                                         |
| `PHOTO_DELETED`     | `TARGET_GONE` | `SUBJECT`, `ORGANIZER`, `SYSTEM` | The photo was deleted without a verdict                          |
| `ACCOUNT_DELETED`   | `TARGET_GONE` | `SYSTEM`                         | The reported member deleted their account                        |

Reports closed before this existed keep a null `closedReason`; their path can't be known. Dismissals are backfilled as `DISMISSED`.

---

## 4. Reporting the event itself

`POST /events/:eventId/reports` covers what the organizers authored: the cover, the title and the description, or the event as a whole. There is one action and no "which part" picker, as with WhatsApp's and Telegram's "Report group"; the note can say what is wrong (built).

- **Only the platform reviews it.** It is the organizers' own content, so organizers can neither see nor resolve it. The CASL `read` and `update` rules for organizers cover `PHOTO` and `MEMBER` reports only, so the queue leaves event reports out and `PATCH /reports/:reportId` answers 403 for them. Every event report starts in `PLATFORM` (`target_is_event`).
- **One OPEN event report per member**, enforced by the partial unique index (§1); a repeat returns it, as for the other kinds. A check constraint keeps `reportedUserId` null on event reports; `photoId` was already limited to photo reports.
- Until the platform tools exist (§8, [EV-58](https://linear.app/mehrshadfb/issue/EV-58)), event reports are resolved in the database.
- **Who set the cover** is recorded on the event (`Event.coverUpdatedById`, set with the cover and cleared with it) and included in the report's `report.created` and `report.escalated` lines, so the reviewer knows whose image it is.

**The cover is hidden, the text is not.** The cover is the one image of an event that photo reports don't cover, so it is hidden the way photos are (`hiddenEventCoverIds`, `api/src/moderation/event-cover-visibility.ts`), wherever an event's `coverUrl` is returned:

- from the member who reported the event, while their report is OPEN;
- from every non-organizer while any OPEN event report is for nudity or violence (`SEVERE_REPORT_REASONS`). Organizers keep seeing it, as they keep seeing reported photos;
- from everyone, organizers included, while any OPEN event report has a reason in `PLATFORM_ONLY_REASONS` (planned).

A hidden cover reads as `coverUrl: null`, the same as no cover. The title and description are never hidden automatically: hiding an event's name would be confusing, and text waits for review.

### Under review

When enough members report the event itself, it goes **under review** (`Event.underReviewAt`). Each OPEN event report is by a different member (one per member), and enough is `underReviewThreshold(memberCount, anySevere)`:

- **Any OPEN event report with a reason in `PLATFORM_ONLY_REASONS`:** one is enough (planned).
- **Any OPEN event report for nudity or violence:** the photo hide threshold, `reportHideThreshold`: 3, or 2 in an event of 3 members or fewer.
- **None severe:** the same, or a tenth of the members rounded up (`UNDER_REVIEW_MEMBER_SHARE`), whichever is more. Events of up to 30 members are unchanged; a 100-member event needs 10 and a 300-member one 30. A few members of a large event can't pause it with spam reports, while severe content still pauses it quickly.

| Members | None severe | Nudity or violence | Child safety or intimate image |
| ------- | ----------- | ------------------ | ------------------------------ |
| 3       | 2           | 2                  | 1                              |
| 4–30    | 3           | 3                  | 1                              |
| 100     | 10          | 3                  | 1                              |
| 300     | 30          | 3                  | 1                              |

Every event report reaches the platform anyway. The threshold only decides when the event pauses by itself, before anyone has looked.

While an event is under review:

- **No one can join.** `POST /events/join` answers 403 with `code: "EVENT_UNDER_REVIEW"`, after the ban check, so a removed member still hears that they were removed.
- **No photos can be added.** `POST /events/:eventId/photos/upload-urls` answers the same 403, organizers included. Slots minted before can still be confirmed.
- **Members keep access.** Nothing is hidden beyond what §4 and §5 already hide, and nothing is deleted.
- **Organizers can still change the cover**, so they can replace one that was reported.
- **Every event response carries `status: "UNDER_REVIEW"`** (otherwise `"ACTIVE"`), so the app can say so on the event screen.
- **The event can't be deleted, and the close job removes none of its photos** until the review is lifted (§7).

The report that puts the event under review is escalated with `event_under_review` (§9); later reports are not, since the event is already there. The update only matches an event not yet under review, so of two reports that cross the threshold together exactly one says so.

**Only the platform lifts it.** Resolving the reports does not. Until the platform tools exist (§8), the platform clears `underReviewAt` in the database, and closes the reports there too.

---

## 5. Hiding reported photos

Hiding is a **filter in the photo read paths**. `PhotoStatus` is untouched and nothing is deleted, so every hide is undone by dismissing the reports.

1. **A photo is hidden from its reporter at once**, for as long as that report is OPEN.
2. **A photo is hidden from everyone except the event's organizers** once its OPEN reports reach the event's threshold:

   | Members in the event (uploader included) | OPEN reports that hide a photo          |
   | ---------------------------------------- | --------------------------------------- |
   | 4 or more                                | `REPORT_HIDE_THRESHOLD` = 3             |
   | 3 or fewer                               | `SMALL_EVENT_REPORT_HIDE_THRESHOLD` = 2 |

   Three keeps one member, or a pair acting together, from taking a photo down for the whole event. An event with fewer than three members besides the uploader could never collect three, so two are enough there. It is never one. In an event of two only rule 1 can apply, and the organizer sees the report.

   One OPEN report per reporter is enforced by the database (§1), so counting rows is counting distinct reporters.

3. **A photo is hidden from everyone except the event's organizers after one OPEN report for nudity or violence**, or one OPEN automated report (§11). Leaving such a photo up while it collects more reports costs more than hiding a harmless one until someone looks.
4. **A photo is hidden from everyone, organizers included, after one OPEN report with a reason in `PLATFORM_ONLY_REASONS`** (planned). Only the platform looks at it.
5. **Resolving restores.** A dismissal brings the photo back for everyone, reporters included; a removal deletes it, so there is nothing to restore.

"Everyone" includes the uploader. Under rules 2 and 3, organizers still see the photo, because they are the ones who have to judge it.

**A closed gallery shows nothing, to anyone.** Once an event's gallery has closed ([event-quotas.md](./event-quotas.md)), no photo of it is listed or opened, organizers included, and none can be reported. The close job removes them. The ones it keeps because of OPEN reports are kept for the platform, and their reports move to the platform's queue (§3).

The threshold is evaluated when photos are read, not stored on the photo. Members joining or leaving can move an event across the 3/4 boundary, and a stored flag would then be stale.

### The shared filter

`PhotoVisibilityService.whereVisibleTo(callerId, event)` returns one `Prisma.PhotoWhereInput`, and it is the only place these rules exist:

```ts
{ id: { in: [] } } // once the gallery has closed: matches nothing, for anyone

{ reports: { none: { status: OPEN, reason: { in: PLATFORM_ONLY_REASONS } } } } // an organizer: rule 4 only (today `{}`)

{
  AND: [
    { reports: { none: { reporterId: callerId, status: OPEN } } },                          // rule 1
    { reports: { none: { status: OPEN, reason: { in: SEVERE_REPORT_REASONS } } } },         // rules 3 and 4
    { reports: { none: { status: OPEN, source: AUTOMATED } } },                             // rule 3 (planned)
    { id: { notIn: photoIdsOverThreshold } },                                               // rule 2
    { NOT: { addedBy: { is: { OR: [blockedByCaller, blockedTheCaller] } } } },              // blocks, §6
  ],
}
```

- `listPhotos` ANDs it into the page query, next to `READY`, the CASL filter and the cursor.
- `findOne` asks `isVisibleTo(photoId, …)`, which is the same filter narrowed to one id. A photo missing from the list is therefore a 404 on its own, and the two cannot drift apart. Membership is still checked first, so a non-member gets 403 as before.
- `ReportsService.reportPhoto` uses `isVisibleTo` as well (§2).

Both callers load the event with `eventForPhotoVisibilityInclude(callerId)`, which brings the caller's membership and the member count along with the row they were loading anyway.

Cost for a non-organizer: **one** extra query per call, a `GROUP BY photoId … HAVING count(*) >= threshold` over the event's OPEN reports on `(eventId, status, createdAt)`. It returns the handful of photos currently waiting for someone, not a row per photo. Rules 1, 3 and 4 and the blocks are subqueries inside the photo query, answered by `(reporterId, photoId) WHERE OPEN` and the two `UserBlock` indexes. There is no per-row query. Organizers pay one subquery for rule 4.

---

## 6. Blocks

| Endpoint                          | Result                                                    |
| --------------------------------- | --------------------------------------------------------- |
| `PUT /users/me/blocks/:userId`    | 200, `{ userId, name, username, blockedAt }`              |
| `DELETE /users/me/blocks/:userId` | 204                                                       |
| `GET /users/me/blocks`            | 200, `{ items: [{ userId, name, username, blockedAt }] }` |

- **Only someone you share an event with.** Anyone else gets the same 404 as a user id that does not exist, so the endpoint cannot be used to find out which ids are real. Blocking yourself is a 403 `CANNOT_BLOCK_SELF`. Organizers can be blocked like anyone else.
- **Both writes are idempotent.** Blocking twice returns the existing block (`ON CONFLICT DO NOTHING` on the unique pair, so two requests at once leave one row); unblocking someone who is not blocked is a 204.
- **Silent.** The blocked user is never notified, no response of theirs changes shape, and no error tells them apart from anyone else.
- **Symmetric in effect.** Photos uploaded by someone I blocked are gone from my list and single reads in every event, and mine are gone from theirs. A photo whose uploader's account was deleted (`addedById` null) matches no block.
- **Organizers are exempt in the events they organize.** They see every photo there, whoever blocked whom, because they have to moderate. The same person in an event they do not organize is filtered like anyone else.
- **Nobody is removed from anything.** Both users stay members, both can upload, and third parties see the photos of both. Removing a member is an organizer's decision, not a side effect of a block.
- **Both still see each other in the members list.** Hiding membership would confuse organizers and would leak anyway through member counts and other members' photos. The row is marked instead (next point), which is how Discord and WhatsApp treat blocked people in shared groups.
- **The participants list marks who I blocked.** Each row of `GET /events/:eventId/participants` has `isBlockedByCaller`, so the client can offer to unblock. It is loaded in the same query as the roster, and only ever from `blocksReceived WHERE blockerId = caller`: nothing in the API reveals who has blocked the caller.
- Reports and blocks are independent. A blocked user can still be reported, and reporting does not block.

### Joining an event across a block

`POST /events/join` first refuses anyone an organizer removed (see [Removing a member](#removing-a-member-and-bans) below), then checks blocks between the joiner and the event's **organizers** (any organizer, not only the creator), in both directions, in one query:

| Situation                                            | Result                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An organizer removed the joiner                      | **403** with `code: REMOVED_FROM_EVENT` and "You were removed from this event by an organizer." They already know, so saying so reveals nothing. Checked before blocks, so they are not told about a block instead      |
| An organizer blocked the joiner                      | **404**, the same `Event with invitation URL "…" not found` as a link that does not exist. The block is never revealed to the person blocked                                                                            |
| The joiner blocked an organizer                      | **403** with `code: ORGANIZER_BLOCKED_BY_CALLER` and "This event is organized by … you blocked. Unblock them to join." The joiner made the block, so explaining it reveals nothing, and the client can offer to unblock |
| Both blocked each other                              | 404, as in the second row                                                                                                                                                                                               |
| The joiner and an ordinary member blocked each other | Joins normally; the photo filter keeps the two apart                                                                                                                                                                    |

Existing memberships are not changed when a block happens later; an organizer who wants a blocked member out uses remove-member.

### Removing a member and bans

An organizer removes a member either with `DELETE /events/:eventId/participants/:targetUserId` or with `REMOVE_MEMBER` while resolving a report. Both run the same routine (`removeMemberInTransaction`), in one transaction:

1. The membership is deleted.
2. An `EventBan` row is recorded (event, member, the organizer who removed them). Removing someone again keeps the first record.
3. The organizer chooses what happens to the member's photos in that event:

   | `photos`         | Effect                                                                                                                                                                                       |
   | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `KEEP` (default) | They stay in the event, still credited to the member, until the gallery closes ([photos-architecture.md](./photos-architecture.md) §9)                                                       |
   | `DELETE`         | Every photo they uploaded to the event is deleted. Reported ones keep their evidence and their reports follow §3, and the objects are purged after the commit (`event.member.photos_purged`) |

   It is a query parameter on the participant route (`?photos=DELETE`) and a body field on `PATCH /reports/:reportId`, where it is only valid with `REMOVE_MEMBER` (400 otherwise).

**A ban is per event.** It only stops rejoining through the invitation link; nothing else about the account changes. Leaving an event on your own records no ban, so you can come back. Leaving asks the member the same KEEP or DELETE question about their own photos. A ban across the whole platform is an account suspension, which only the platform can do (§8).

**Organizers manage bans.** `GET /events/:eventId/bans` lists them newest first with each member's name and username. `DELETE /events/:eventId/bans/:userId` lifts one; it is idempotent, and the person is not re-added but can rejoin through the link.

A ban cascades with the event and with the banned account, and `bannedById` becomes null when the removing organizer's account is deleted.

### Invite links and becoming an organizer

Every event has two invite links, **Participant** and **Viewer** (`EventInvite`). There is no organizer link: a link can be forwarded or leak, and an organizer can remove people and delete the event. **Someone becomes an organizer only when an organizer promotes a member** (`PUT /events/:eventId/participants/:targetUserId/access`). The last organizer can't be demoted (`LAST_ORGANIZER`).

- Promoting a member moves their OPEN reports to the platform (§3).
- `POST /events/:eventId/invites/:accessLevel/regenerate` accepts `PARTICIPANT` and `VIEWER`; `ORGANIZER` is a 400.
- Organizer links created before this rule were deleted by a migration. A leftover token reads as an unknown link (404).

---

## 7. Evidence, deletes and retention

Deletes waiting for moderation ([EV-106](https://linear.app/mehrshadfb/issue/EV-106)), evidence and retention ([EV-61](https://linear.app/mehrshadfb/issue/EV-61)) are built. The child-safety and intimate-image procedures are **Planned** ([EV-62](https://linear.app/mehrshadfb/issue/EV-62)).

**The rule:** nobody can make a report, or what it is about, disappear before it has been judged. Users can still delete their own things whenever they like: the content is hidden from everyone at once, and only the evidence copy stays, locked away.

### Deletes wait for moderation

- **An event with OPEN reports, or under review, can't be deleted.** `DELETE /events/:eventId` answers 403 with `EVENT_HAS_OPEN_REPORTS` or `EVENT_UNDER_REVIEW`.
  - Organizers can clear photo and member reports in `ORGANIZERS` themselves.
  - Everything else waits for the platform.
  - Deactivating stays allowed: it frees the host's place and hides the photos.
- **The close job keeps every photo of an event under review** until the platform lifts it. It already keeps photos with OPEN reports (built). The next sweep removes them once nothing holds them ([photos-architecture.md](./photos-architecture.md) §12).
- **Account deletion is never refused**, but it no longer deletes a sole organizer's event that has OPEN reports or is under review. Such an event is left with no members, for the platform, which deletes it when it is done (§8). An event without them is deleted as today.

### Evidence

- **A snapshot is written with every report**, in the same transaction (`EvidenceService.writeSnapshot`). `ReportEvidence` holds the reported object's key (the photo, or the event's cover), its type and size, and the subject's id and username at that time. It has no foreign keys to them, so it outlives the photo and the account.
- **Quarantine instead of purge.** Before any path deletes an object a report is about, it copies the object to `evidence/{reportId}/{original key}` and points the snapshot at the copy, with the SHA-256 S3 computes while copying (`EvidenceService.preserveBeforeDelete`). Every photo and cover delete goes through it (`PhotoPurgeService`, `PhotosService.deletePhoto`, a verdict's photo delete, `ImageUploadService` replacing or removing a cover). That covers deletes by:
  - the uploader or an organizer;
  - a member's removal or departure;
  - account deletion;
  - the close job;
  - a verdict.

  The copy never blocks the user's delete. If it fails, the original object is kept, `report.evidence.copy_failed` fires, the orphan reconciler leaves the object alone, and the daily evidence job retries the copy, then deletes the original.

- **Evidence counts toward nobody's gallery storage**, and the orphan reconciler treats `evidence/` as owned by the snapshots (`EvidenceOrphanSource`).
- **Evidence is locked away.** The `evidence/` prefix gets the protections in [photo-privacy.md](./photo-privacy.md): no human reads except through the platform's logged review (§8), and every read is logged and alerted. The bucket policy, the KMS key and the CloudTrail rules cover the whole bucket, so they cover `evidence/` with no Terraform change; the API's `s3:GetObject` and `s3:PutObject` are what `CopyObject` needs.
- **An intimate image is not kept once removed.** When a `NON_CONSENSUAL_INTIMATE_IMAGE` report is actioned, its evidence object is deleted and only the hash and metadata are kept. Keeping a copy of the image would undo the removal the person asked for. The exception is a hold for child safety or law enforcement.

### Retention

| What                                          | Kept for                                                  | Then                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Reports and their evidence                    | 1 year after the report closes (`REPORT_RETENTION_DAYS`)  | Purged by the daily evidence job (`MODERATION_EVIDENCE_JOB_ENABLED`, opt-in like the other jobs that delete from S3), objects first |
| A report under a hold                         | Until `holdUntil`                                         | Purged as above                                                                                                                     |
| Child-safety reports to NCMEC or the police   | 1 year from the submission (`holdUntil`), longer if asked | Purged as above                                                                                                                     |
| Hash and metadata of a removed intimate image | 1 year after closure, to block identical re-uploads       | Purged as above                                                                                                                     |
| `note`                                        | As its report                                             | Never logged ([logging-conventions.md §3](../api/docs/logging-conventions.md#3-redaction--pii-the-non-negotiable-rule))             |

- **A hold** (`holdUntil`, `holdReason`) stops the purge. Only the platform sets one: for a child-safety report, a law-enforcement preservation request (18 U.S.C. §2703(f), 90 days, renewable), or legal advice. Holds are reviewed and released when they lapse.
- **Why one year.** US law makes a CyberTipline report a request to preserve its contents for 1 year (18 U.S.C. §2258A(h), REPORT Act). Canada asks for 21 days today, rising to 1 year under the Protecting Victims Act (S.C. 2026, c. 19, not in force yet). A year also covers repeat-offender history. PIPEDA and Law 25 ask for a fixed, documented maximum, and this is it.
- **The privacy policy says so**: reported content and reports are kept for up to a year after deletion, and longer under a legal hold.
- The periods are pending the legal review in [EV-62](https://linear.app/mehrshadfb/issue/EV-62).

### Child safety

A `CHILD_SAFETY` report is handled only by the platform, by the runbook in [EV-62](https://linear.app/mehrshadfb/issue/EV-62):

1. It **pages**, and a 1-year hold starts at once.
2. The reviewer looks only as far as needed to judge it, through the logged review (§8), and never copies or forwards it.
3. Apparent child sexual abuse material is reported to the **NCMEC CyberTipline** "as soon as reasonably possible" (18 U.S.C. §2258A), and to **Cybertip.ca and the police** for Canada (S.C. 2011, c. 4). The reference number goes in `authorityReference`, and `holdUntil` becomes the submission date plus 1 year.
4. The photo is removed and the account suspended (§8). Nothing tells the account why, so nothing prejudices an investigation.

Google Play also expects a public child-safety standards page and a named child-safety contact in Play Console. Both are part of [EV-62](https://linear.app/mehrshadfb/issue/EV-62).

### Intimate images: the TAKE IT DOWN Act

From May 19, 2026, a platform that hosts user content must remove a non-consensual intimate image **within 48 hours** of a valid request from the person shown, and make reasonable efforts to remove identical copies (47 U.S.C. §223a).

- **In the app**, the request is a `NON_CONSENSUAL_INTIMATE_IMAGE` report. It hides the image from everyone at once (§5), pages, and starts the 48-hour clock from `createdAt`.
- **Outside the app**, the person may not be a member, or may not have an account. A public request form on the website collects what the Act asks for: a signature, enough to find the image, a statement that it was shared without consent, and contact details. The platform files it as a report on their behalf.
- **Identical copies** are found by SHA-256 across all events and removed with it.
- The privacy policy and the website describe the process in plain language.

Whether the Act covers invite-only galleries is uncertain; we follow it anyway.

---

## 8. Platform tools

**Planned** ([EV-58](https://linear.app/mehrshadfb/issue/EV-58), [EV-59](https://linear.app/mehrshadfb/issue/EV-59)). Today the platform works from the logs and the database.

Platform moderators are accounts with a platform-moderator permission. How it is granted is decided in [EV-59](https://linear.app/mehrshadfb/issue/EV-59). Their endpoints sit under an admin-only route prefix and are audit-logged like the organizer path. Every closure records `closedByRole = PLATFORM`.

What they can do:

- **See the platform queue** across events, oldest first, with the escalation reasons. They can also see any event's `ORGANIZERS` reports.
- **Close any report** with the organizer verdicts (§3). The same shared routines run, so there is no second path that deletes photos.
- **Review evidence** through a logged, short-lived link: the photo while it exists, its quarantined copy after.
- **Suspend an account.** `User.suspendedAt` makes every request answer 403 `ACCOUNT_SUSPENDED`, and lifting it restores access. It closes the account's reports as `ACCOUNT_SUSPENDED`. Its events keep running for their other organizers; an event it organized alone is suspended too.
- **Suspend, restore or delete an event** ([EV-58](https://linear.app/mehrshadfb/issue/EV-58)). A suspended event is hidden from its members and reads as `status: "SUSPENDED"`. A deleted one goes with its reports closed first as `EVENT_DELETED`.
- **Lift a review** (`underReviewAt`) and close event reports.
- **Set and release holds**, and record an `authorityReference`.

**The target: act within 24 hours of a report reaching the platform**, and within 48 hours of an intimate-image request. Apple's reviewers expect the 24 hours, and the TAKE IT DOWN Act requires the 48. The overdue alert (§9) is the safety net.

---

## 9. Escalation and alerts

Alerting keys off stable event names in the logs. **The alerts only work once they reach a person**: the log platform and its routing to email and paging are in [alerting.md](../api/docs/alerting.md).

| Event                                      | Level   | When                                                              | Fields                                                                                                                                                                                |
| ------------------------------------------ | ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.created`                           | `info`  | every new report                                                  | `reportId`, `eventId`, `callerId`, `targetType`, `photoId`, `reportedUserId`, `reason`, `queue`, `audit`                                                                              |
| `report.escalated`                         | `warn`  | a report that needs the platform, at filing or when it moves (§3) | the same, plus `escalationReasons`                                                                                                                                                    |
| `report.resolved`                          | `info`  | a verdict                                                         | `reportId`, `eventId`, `callerId`, `targetType`, `photoId`, `reportedUserId`, `action`, `closedReason`, `closedByRole`, `closedReports`, `removedPhotoId`, `removedMemberId`, `audit` |
| `report.stale`                             | `warn`  | hourly, once per report that has been in `PLATFORM` over 24 hours | `stale` (the count), `reportIds` and `eventIds` of the 20 oldest, `oldestEscalatedAt`, `audit`                                                                                        |
| `report.evidence.copy_failed`              | `error` | a quarantine copy failed and the original was kept (§7)           | `reportId`, `err`                                                                                                                                                                     |
| `user.block.created`, `user.block.removed` | `info`  | the block list changed                                            | `callerId`, `blockedUserId`, `audit`                                                                                                                                                  |

**`report.escalated` and `report.stale` are the alerts** (tickets, see [alerting.md §3](../api/docs/alerting.md#3-events-to-alert-on)); the rest are audit records.

- **Paging.** `child_safety` and `intimate_image` page; every other reason raises a ticket (planned).
- **The stale check.** It now runs on the platform queue only, and each report is reported once (`overdueAlertedAt`), so it no longer repeats every hour. `StaleReportCheckScheduler` runs every hour with the usual `report.stale_check.run_completed` / `run_failed` heartbeat (built).
- **Moving reports.** The same hourly run moves `ORGANIZERS` reports past 24 hours to the platform (`organizer_timeout`, §3).

`escalationReasons` holds one or more of:

| Reason                     | Meaning                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `severe_reason`            | The reason is `NUDITY_OR_SEXUAL` or `VIOLENCE`. A photo report of this kind also hides the photo (§5). The report stays with organizers. |
| `child_safety`             | Planned. The reason is `CHILD_SAFETY` (§7). Pages.                                                                                       |
| `intimate_image`           | Planned. The reason is `NON_CONSENSUAL_INTIMATE_IMAGE` (§7). Pages; the 48-hour clock runs.                                              |
| `target_is_organizer`      | The reported member, or the uploader of the reported photo, organizes the event and cannot judge it themselves.                          |
| `target_is_sole_organizer` | Added to `target_is_organizer` when they are the event's only organizer.                                                                 |
| `target_is_event`          | Every report about the event itself (§4).                                                                                                |
| `hide_threshold_reached`   | This report is the one that hid the photo from the event.                                                                                |
| `event_under_review`       | This report put the event under review (§4): joins and new photos are refused until the platform lifts it. Urgent.                       |
| `organizer_timeout`        | Organizers left it OPEN for 24 hours.                                                                                                    |
| `gallery_closed`           | The gallery closed with the report OPEN, or it was filed after close.                                                                    |
| `severe_dismissed`         | An organizer dismissed a severe report.                                                                                                  |
| `target_deleted`           | The photo or account was deleted without a verdict, and the report is severe or already with the platform.                               |
| `automated_flag`           | Planned. Upload screening flagged the photo (§11).                                                                                       |

A repeat that returns an existing report logs nothing, so each report is announced once. Only ids and enum values are logged. The `note` is free text written by a user and is never logged.

---

## 10. Terms acceptance

Guideline 1.2 and Google Play also want users to agree to terms that forbid objectionable content, before they can see or post any. `POST /users/me/onboarding` **requires** `acceptedTerms: true`: onboarding without it, or with any other value, is a 400 and creates nothing. The acceptance time is stored as `User.termsAcceptedAt`, and `GET /users/me` returns it (built).

The app's onboarding screen shows an explicit consent control that links to the Terms of Use and Privacy Policy, and Continue stays disabled until it is ticked. Both legal screens are reachable before onboarding.

- **The terms say there is no tolerance for objectionable content or abusive users**, and list what is forbidden, child sexual exploitation included. Apple's rejection notices quote this wording.
- **No invite link opens a gallery before onboarding**, so nobody sees a photo before accepting.
- **The minimum age is not decided yet.** 13 is the likely floor (14 in Quebec, where Law 25 asks for a parent's consent below that). It drives the store age ratings and the US state app-store age laws.
- `termsAcceptedAt` stays nullable in the response. Accounts onboarded before the field was required have null, and nothing has been released yet, so no re-prompt is needed. Once the terms change after launch, a versioned acceptance (which version, when) is the way to ask again.

---

## 11. Upload screening

**Planned** (filed once this design is agreed). Apple's guideline 1.2 asks for "a method for filtering objectionable material from being posted". Reports and hiding act only after a photo is up; screening catches the worst of it before anyone sees it.

- **When.** Upload confirmation calls Amazon Rekognition `DetectModerationLabels` on the object already in S3. The photo becomes `READY` as today.
- **Flagged photos.** A photo with a label above the configured confidence in the nudity, violence or exploitation categories gets an automated report:
  - `source: AUTOMATED`, no reporter, a reason mapped from the label;
  - in `PLATFORM` (`automated_flag`);
  - hidden from everyone but organizers until it is judged (§5, rule 3).

  The uploader isn't told.

- **Failure is open.** If the call fails, the photo is published, a warning is logged, and nothing retries. Uploads never wait on the screen.
- **Disclosure.** The privacy policy names image screening by a service provider, as Apple guideline 5.1.2(i) asks.
- **Not in scope.** Matching against known child sexual abuse material (PhotoDNA, Thorn Safer) is for later. It needs an application and a contract, and the law doesn't require it at our size.

---

## 12. Rate limiting

The seven mutations carry `@RateLimit("sensitive")`: 10 a minute per user, on top of the global default.

- `POST /photos/:photoId/reports`
- `POST /events/:eventId/participants/:targetUserId/reports`
- `POST /events/:eventId/reports`
- `PATCH /reports/:reportId`
- `PUT /users/me/blocks/:userId`
- `DELETE /users/me/blocks/:userId`
- `DELETE /events/:eventId/bans/:userId`

The two list endpoints stay on the global default. The platform's endpoints (§8) are admin-only and not rate limited per user. See [rate-limiting.md](./rate-limiting.md).

---

## 13. Out of scope

- **Telling reporters the outcome.** A report's response is its receipt. Reporters see a dismissed photo come back, and are told nothing else, so organizers can't be pressured through them. The EU DSA would require a decision notice; it comes with an EU launch.
- **Notifications** ([EV-33](https://linear.app/mehrshadfb/issue/EV-33)). Organizers should hear about new reports and hidden photos, and uploaders when their photo is removed or they are removed from an event.
- **Appeals.** A removed photo or member has no appeal flow. When one comes, it goes to the platform, never back to the organizer who decided.
- **Automatic removal.** No number of reports deletes a photo or removes a member. Hiding is the strongest automatic effect, and deleting is always someone's verdict.
- **Hiding members.** A block filters photos. The blocked member still appears in the participants list, flagged for the blocker.
- **A separate decision table.** One verdict writes the same outcome on every report it closes, and the logs carry the audit trail. A table of decisions, with appeals and overrulings linked to it, is for when appeals exist.
- **EU and UK duties.** These are DSA statements of reasons, its notice-and-action rules, and the UK Online Safety Act's risk assessment and records. They come with those markets.
