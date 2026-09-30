# Event quotas and gallery lifetime

People open an event, put photos in it, download them, and the gallery closes after a window chosen up front. The event's details stay.

This is the target. The running app still follows [Current behavior](#current-behavior). Implementing the target is [EV-64](https://linear.app/mehrshadfb/issue/EV-64). This guide is [EV-63](https://linear.app/mehrshadfb/issue/EV-63).

The free-tier numbers below are the ones the refactor builds to: **5 active events** per user, **500 MB** per gallery, and a close window of **14, 30, 60, or 90 days**, default **30**.

500 MB means `500 × 1024 × 1024` bytes (524,288,000). That is the same binary megabyte as today's ceiling, `FREE_TIER_STORAGE_LIMIT_BYTES` = `5 × 1024³` = 5,368,709,120 bytes (5 GiB), in `api/src/photos/photos.constants.ts`.

## Current behavior

An event lasts until an organizer deletes it. Account deletion removes it only when that account is the only member; otherwise the event is handed to another member or left with its remaining organizers (`api/docs/account-deletion.md`). Nothing in the schema closes a gallery on its own. `Event` stores `title`, `description`, `date`, `creatorId`, `invitationUrl`, and `coverS3Key` (`api/prisma/schema.prisma`). There is no close time and no archived state.

The quota is personal, and it lasts as long as the photos do.

- **Ceiling.** `User.storageLimitBytes`, default 5 GiB. The Prisma `@default(5368709120)` and `FREE_TIER_STORAGE_LIMIT_BYTES` are the same number. There is no environment override. Raising a ceiling is a row update (`api/docs/photos-architecture.md` §9).
- **What counts.** `SUM(sizeBytes)` over the caller's photos in status `PENDING` or `READY`. Pending rows count so a client cannot mint slots past the cap and confirm them later.
- **Where it is checked.** `PhotoStorageService.reserveUploadBytes()`, inside `PhotosService.createUploadSlots()`, after authorization. The limit read, the sum, and the insert of the batch's `PENDING` rows share one Serializable transaction. Over the cap, upload-url creation returns **413** with `STORAGE_QUOTA_EXCEEDED` ("Storage quota exceeded").
- **Read API.** `GET /users/me/storage` returns `usedBytes`, `limitBytes`, and `remainingBytes` as strings (`api/src/users/users.controller.ts`, `api/src/users/dto/user-storage-response.dto.ts`).
- **Photos outside events you still belong to.** Usage includes photos in events the uploader left or was removed from, when those photos were kept. Uploaders can still delete their own photos without membership, so those bytes are not stuck (`api/docs/photos-architecture.md` §9, [EV-39](https://linear.app/mehrshadfb/issue/EV-39)).
- **Billing hook.** `PhotoStorageService.addStorageLimit(userId, additionalBytes)` adds to one account's ceiling. No HTTP route calls it. It was built so a purchase could raise the personal pool. The Monetization project summary still describes that offer ("Paid storage upgrades on top of the per-user storage limit").
- **Account deletion.** The ceiling goes away with the user row. Photos kept under `?photos=KEEP` then count toward nobody's quota (`api/docs/account-deletion.md`).

A per-event quota, by count and by bytes, is listed as deferred in `api/docs/photos-architecture.md` §7. It was never built. The personal 5 GiB sum is the only cap.

These sit beside the quota and are unchanged by it:

| Rule | Where |
| --- | --- |
| One photo is at most 25 MB (`MAX_PHOTO_SIZE_BYTES`) | `api/src/photos/photos.constants.ts` |
| One upload-url batch is at most 20 photos | same file, `MAX_UPLOAD_BATCH_SIZE` |
| Avatars and event covers are single images, not `Photo` rows, and they do not count toward the quota | `api/docs/image-uploads.md` |
| The profile screen shows the personal pool ("used of limit") | `mobile/features/profile/components/storage-card.tsx` |

Organizer delete removes the event row. Photo rows cascade with it, and the objects are purged after the commit (`EventsService.delete` in `api/src/events/events.service.ts`). That delete is a different act from the archive in this guide: delete removes the record, archive keeps it.

## Caps

Two caps replace the personal pool.

| Cap | Free tier | When it is checked |
| --- | --- | --- |
| Active events | 5 per user | Creating an event |
| Gallery size | 500 MB per event | Minting upload slots |

The gallery cap is a byte total shared by everyone who uploads to that event. A video, or a professionally shot photo, spends more of the 500 MB than a phone photo, which is why the cap is bytes. The 25 MB per-file limit and the batch of 20 stay; they bound one request, and the gallery cap is separate.

Five full galleries are 2,500 MB, about 2.4 GiB, and only while those events are active. Today's 5 GiB is one person's uploads and it does not expire. Guest uploads spend the event's 500 MB, not a personal pool.

`User.storageLimitBytes`, `GET /users/me/storage`, and `PhotoStorageService.addStorageLimit` describe the personal ceiling. They stop being the product cap. The reservation transaction in `api/docs/photos-architecture.md` §9 stays the mechanism: the same Serializable check-and-insert, summing the event's `PENDING` and `READY` photos, against 500 MB instead of the uploader's `storageLimitBytes`.

A batch that would pass 500 MB returns 413, the same family as today's `STORAGE_QUOTA_EXCEEDED`. A sixth active event is a different failure, returned from event creation, so a client can tell "this gallery is full" from "you already have five open."

## Lifetime

The organizer chooses the window when creating the event. The choices are 14, 30, 60, and 90 days. Leaving it unset means 30. The numbers are product constants, the same way the 5 GiB default is a constant and not an environment variable.

The gallery closes at the event's `date` plus that many days. An event created before its date stays open through the date and the window after it, which is the case the window is for: photos go in around the day itself, and people download them afterward.

Creation is rejected when that close instant is already in the past, so an event cannot be born archived. A date forty days ago with a 30-day window fails; a 60-day window on the same date still has time left.

The chosen window stays for the life of the gallery. Organizer delete remains the way to remove an event before it archives.

Editing the date (`UpdateEventDto` already accepts `date`) moves the close instant with it. A date edit that puts the close instant in the past archives the gallery. An archived gallery stays archived. Moving the date later does not reopen it.

An event date far in the future holds one of the five slots until that date plus the window.

## Active and archived

An event is **active** from creation until its close instant. It accepts uploads, members can download, and it uses one of its creator's five slots.

An event is **archived** from the close instant on. That is the finished event.

| | Active | Archived |
| --- | --- | --- |
| Photo uploads | Allowed, inside the 500 MB | Rejected |
| Photo downloads | Presigned reads of `READY` photos | Nothing left to download |
| Event details (title, description, date, members, cover, invites, bans) | Kept | Kept |
| Counts toward the creator's 5 | Yes | No |

Members are expected to download during the active window. After archive the bytes are gone.

The event row stays, and so does everything that belongs to the record rather than the gallery: title, description, date, invitation, memberships, bans, the cover image, and member reports. The cover stays because it is the event's image, not a gallery photo, and it already sits outside the photo quota (`api/docs/image-uploads.md`).

The gallery is discarded the same way an organizer delete discards photos today, and then the paths diverge. Photo rows are removed first, so nobody can be shown a photo whose object is already gone, and any in-flight quota those rows held is released. Objects are purged after that commit. A PUT that still lands is an orphan for the daily S3 reconciler, as it is after `EventsService.delete`. `PENDING` slots are discarded with the rest. A confirm after archive does not bring a photo back.

Joining an archived event still works, and it does not spend an active-event slot. Joining never spends one. The invite opens the record. Uploads to it fail.

Archive and organizer delete both exist:

- **Archive** is automatic at the close instant. The gallery goes. The record stays.
- **Delete** is the organizer action in `EventsService.delete`. The record goes, and any photos still in an active gallery go with it.

## Whose five slots

An active event uses a slot of the user who created it. Co-organizers do not each spend a slot on that same event. Joining someone else's event does not spend a slot, so attending five events still leaves room to open one.

`Event.creatorId` is attribution only, and account deletion sets it to null (`onDelete: SetNull` in `api/prisma/schema.prisma`). The slot follows the creating account while that account exists. Once the account is deleted, an event that is still inside its window stays active until the close instant and counts toward nobody, which is the same outcome account deletion already has for kept photos. The successor organizer from the handover rules manages it and is not charged one of their five.

While a gallery is active, account deletion's `?photos=KEEP` and `?photos=DELETE` still decide what happens to that account's uploads (`api/docs/account-deletion.md`). After archive the gallery is already gone, so the choice only matters for events that have not closed.

## What the refactor has to revisit

These assume the personal ceiling. They are still the live behavior until [EV-64](https://linear.app/mehrshadfb/issue/EV-64) lands.

| Today | Guide |
| --- | --- |
| `User.storageLimitBytes` and `FREE_TIER_STORAGE_LIMIT_BYTES` (5 GiB) | Gallery cap of 500 MB, shared by the event. The personal ceiling stops being the gate. |
| `GET /users/me/storage` and `mobile/features/profile/components/storage-card.tsx` ("used of limit") | Active events used of 5, and on each event the gallery's bytes used of 500 MB. [EV-46](https://linear.app/mehrshadfb/issue/EV-46) designs a storage screen on top of the personal pool. |
| Usage sums the uploader's photos, including ones in events they left ([EV-39](https://linear.app/mehrshadfb/issue/EV-39)) | Those photos spend the event's 500 MB until the event archives, then the gallery is discarded. Leaving still asks keep-or-delete for an active gallery ([EV-47](https://linear.app/mehrshadfb/issue/EV-47)). |
| `PhotoStorageService.addStorageLimit` raises one account's byte ceiling | The paid offer below keeps a gallery past the free window. This method is the hook for the old offer. |
| Per-event quota listed as deferred (`api/docs/photos-architecture.md` §7) | This guide is that quota, in bytes, plus the active-event cap and the close window. |
| Events have no end | Active until `date` plus the chosen window, then archived. |

## Paid long-term storage

A later paid service can keep a gallery after the free window. Weddings are the case it is for: the couple wants the photos to remain, and 90 days is the longest free window. The free path still archives on schedule and discards the gallery. The event record stays either way.

That offer replaces the one `addStorageLimit` was built for. Selling a higher personal byte ceiling, and the Monetization project's current summary of that, belong to the rules in [Current behavior](#current-behavior).

## Unresolved

Discarding a gallery deletes reported photos. `Report.photo` is `onDelete: SetNull`, so the report row can survive with `photoId` cleared, and the object purge removes the image. [EV-61](https://linear.app/mehrshadfb/issue/EV-61) is about keeping reported content for a retention window and for legal holds. The close job has to respect that once it exists. Until it does, archive will drop the only copy of a reported photo.

Telling members that a gallery is about to close, so they still have time to download, is later work.
