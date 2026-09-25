# Image Uploads — single images on an entity

A user has one avatar; an event has one cover. These are **single display images that belong to a row**, which is a different problem from event photos ([photos-architecture.md](./photos-architecture.md)): one image, replaced in place, small, no quota, no list. The mechanics are shared and know nothing about users or events; a feature supplies a prefix, an owner id, and the column the key lives in.

Like photos, the API never proxies image bytes. Clients upload to and download from S3 with short-lived presigned URLs. The protocol the three upload kinds share, and how they differ, is in [uploads.md](./uploads.md).

---

## 1. The shared module (`src/images`)

| Piece                                                                     | Role                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ImageUploadService`                                                      | Mint an upload, confirm it into a slot, remove a slot's image, presign a download URL |
| `ImageOrphanSource`                                                       | Base class that registers an image prefix with the S3 orphan reconciler (§6)          |
| `images.constants.ts`                                                     | Allowed types, max size, TTLs, the confirm window, the key builder and key pattern    |
| `CreateImageUploadDto`, `ConfirmImageUploadDto`, `ImageUploadResponseDto` | Request/response bodies every image endpoint reuses                                   |
| `ImagesModule`                                                            | Exports `ImageUploadService` and re-exports `StorageModule`, so one import is enough  |

It reuses `S3Service` for every S3 call and owns no table. The row is the feature's business, reached through two small interfaces:

```ts
interface ImageUploadTarget {
  prefix: string;
  ownerId: string;
} // where the image lives
interface ImageSlot {
  currentKey: string | null;
  save(key: string | null): Promise<void>;
} // the column
```

### Limits

- **Content types:** `image/jpeg`, `image/png`, `image/webp`. Display images are shown to other people on every platform, so only formats every client decodes are accepted (no HEIC/HEIF, unlike event photos); clients re-encode after cropping anyway.
- **Size:** at most `MAX_IMAGE_SIZE_BYTES` (**5 MB**). Event photos keep their own 25 MB cap.
- **No storage quota.** Images are not `Photo` rows, so they never count toward `GET /users/me/storage` or the 5 GiB photo quota. One small object per entity does not need one.

### Key layout

```
{prefix}{ownerId}/{uploadId}        avatars/{userId}/{uploadId}
                                    event-covers/{eventId}/{uploadId}
```

`uploadId` is a UUID minted per upload, so a replacement never overwrites the object that is still being displayed, and a cached URL never shows stale bytes under the same key.

---

## 2. The flow is stateless

Photos insert a `PENDING` row before minting a URL, because they reserve quota. A single image has nothing to reserve, so **nothing is stored at mint time**: no pending-upload column, no row.

1. **Mint.** `createUpload(target, { contentType, sizeBytes })` validates the type and size, mints `uploadId`, and presigns a PUT for `{prefix}{ownerId}/{uploadId}` (TTL 15 min). `Content-Type` and `Content-Length` are signed into the URL, so S3 refuses any other body. Returns `{ uploadId, uploadUrl }`.
2. **Upload.** The client PUTs the bytes to S3.
3. **Confirm.** `confirmUpload(target, uploadId, slot)`:
   - **re-derives the key on the server** from the target and the `uploadId`. The client never sends a key, and `ownerId` always comes from the server side (the access token, or a row the caller was authorized against), so a caller can only ever name objects under its own owner;
   - returns at once if the slot already references that key (idempotent; a retried confirm must never delete the image it just set);
   - `HeadObject`: missing → **404**; older than the confirm window (§6) → object discarded, **422**; type not allowed or size outside `1..MAX_IMAGE_SIZE_BYTES` → object discarded, **422**. Nothing was stored at mint time, so the check is against the module's limits rather than the declared values, which the signed URL already enforced;
   - deletes the previously referenced object, then calls `slot.save(key)`.
4. **Read.** `getDownloadUrl(key)` presigns a GET (TTL 15 min), or returns `null` for an unset image. URLs are never stored. Signing is local CPU work with no network call, so presigning one URL per listed row is fine; what a listing must not do is add a database query per row.
5. **Remove.** `remove(slot)` deletes the object, then calls `slot.save(null)`. No image → no-op.

---

## 3. Cleanup rules

### Replace and remove: object first, row second

The same order, for the same reason, as a manual photo delete ([photos-architecture.md §5](./photos-architecture.md#5-delete)): the request is user-driven, so it can be retried, and the order is chosen so that **every failure leaves a state the same request repairs**.

| Failure                                   | State left behind                                   | Repair                                                                     |
| ----------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Deleting the old object fails             | Row and old image untouched; request fails with 500 | Retry. On a replace the new object is still in S3, waiting to be confirmed |
| Row write fails after the old object went | Row references a deleted object until the retry     | Retry: `DeleteObject` on a missing key is a no-op, then the row is written |

The other order (row first, then a best-effort delete) was rejected: the moment that delete failed, the old object would be referenced by nothing, no request could ever find it again, and only the orphan reconciler could reclaim it. That job is opt-in and off in most environments (§6). Here a success response means the old bytes are gone, which is also what a person removing their picture expects.

### Account and entity deletion: row first, purge last

Deleting the owning row cannot be retried once the row is gone, so it follows the event-delete order instead: collect the key, delete the row, purge S3 best effort afterwards. For avatars that is one more key in the list `AccountDeletionPrepService` already returns ([account-deletion.md §6](./account-deletion.md)); for event covers it is one more key next to the event's photo keys, in both places an event is deleted (§5). There is no separate path. A purge that fails leaves an orphan for the reconciler.

### What leaves an orphan

| Case                                                              | Reclaimed by                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Upload minted and PUT, never confirmed                            | Orphan reconciler, once older than its minimum age (§6)              |
| Upload rejected at confirm, and the discard `DeleteObject` failed | Orphan reconciler; logged as `image.upload_rejected.object_retained` |
| Two confirms race; the loser gets 409 and does not retry          | Orphan reconciler (the loser's object was never referenced)          |
| Account-deletion or event-deletion purge failed                   | Orphan reconciler                                                    |
| Minted, never PUT                                                 | Nothing to reclaim: no row and no object exist                       |

---

## 4. Avatars (`src/users`)

`UserDetails.avatarS3Key` (nullable, unique). It lives on `UserDetails` rather than `User` because `User` is the identity and saga record while `UserDetails` is the profile (name, email) the avatar is shown with; it cascades with the profile; and every place that displays an avatar already loads `details`, so exposing it costs no extra query. The consequence is that **an avatar can only be set after onboarding** (422 before).

| Endpoint                              | Success                                      | Errors                                                                                                                     |
| ------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /users/me/avatar/upload-url`    | **201** `{ uploadId, uploadUrl }`            | 400 invalid type/size · 401 · 422 onboarding incomplete                                                                    |
| `PUT /users/me/avatar` `{ uploadId }` | **200** the user profile (`UserResponseDto`) | 400 · 401 · 404 nothing uploaded · 409 avatar changed concurrently · 422 onboarding incomplete, or upload expired/rejected |
| `DELETE /users/me/avatar`             | **204** (also when there is no avatar)       | 401 · 422 onboarding incomplete                                                                                            |

`PUT` because confirming is idempotent and sets the one avatar resource; the mint mirrors the photos `upload-urls` route.

- **Authorization.** Every route is `/users/me/...` and acts on the id from the access token, like the rest of `UsersController`; there is no route that names another user's avatar, and the S3 key is derived from that same id. (Users are not a CASL subject in this codebase; event covers authorize through the event's abilities instead, §5.)
- **Reads.** `details.avatarUrl` on every `UserResponseDto` (`GET /users/me`, onboarding, `PATCH /users/me`, `PUT /users/me/avatar`) and `avatarUrl` on each `GET /events/:eventId/participants` row: a presigned GET URL or `null`. The participants query already includes `user.details`, so the listing stays at one query. The S3 key itself is never returned.
- **Concurrency.** The row write is conditional on the key that was read (`updateMany where avatarS3Key = <previous>`). Of two racing confirms one writes and the other gets **409** and can retry, instead of both succeeding and one object ending up referenced by nothing.
- **Logging.** `user.avatar.set` (`userId`, `uploadId`, `replaced`) and `user.avatar.removed`, both `audit: true`. Presigned URLs carry a signature and are never logged; neither are keys.
- **Account deletion.** Prep adds `avatarS3Key` to the `s3Keys` it returns, whatever the `?photos=` policy (an avatar is never shared content); the saga purges it last. The column is left alone and cascades with the row, so a resumed saga finds the same key.

---

## 5. Event covers (`src/events`)

`Event.coverS3Key` (nullable, unique), keys under `event-covers/{eventId}/{uploadId}`. The second consumer, and the same shape as the avatar: `EventCoverService` holds the target, the slot, and the audit lines, and everything else is the shared module.

| Endpoint                                    | Success                                | Errors                                                                                                                  |
| ------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /events/:eventId/cover/upload-url`    | **201** `{ uploadId, uploadUrl }`      | 400 invalid type/size · 401 · 403 · 404 no such event                                                                   |
| `PUT /events/:eventId/cover` `{ uploadId }` | **200** the event (`EventResponseDto`) | 400 · 401 · 403 · 404 no such event, or nothing uploaded · 409 cover changed concurrently · 422 upload expired/rejected |
| `DELETE /events/:eventId/cover`             | **204** (also when there is no cover)  | 401 · 403 · 404 no such event                                                                                           |

- **Authorization.** Whoever may update the event may manage its cover: the existing CASL `update` ability on `Event`, which organizers hold. All three routes go through `EventsService.getUpdatable`, the same check `PATCH /events/:eventId` makes, so the answers match the other event routes: 404 for a missing event, 403 for a participant, a viewer, or someone who is not a member at all. The key's owner id is the id of the event that check was made against, never anything from the body.
- **Reads.** `coverUrl` on every `EventResponseDto` (create, list, join, single read, update, regenerate-url, `PUT .../cover`): a presigned GET URL or `null`. The key is a column of the row each of those already loads, so the events list stays at its two queries (the caller lookup behind the ability, and the list); the controller presigns one URL per row. The S3 key itself is never returned.
- **Concurrency.** The row write is conditional on the key that was read (`updateMany where coverS3Key = <previous>`). Two organizers confirming at once get one write and one **409**.
- **Logging.** `event.cover.set` (`eventId`, `callerId`, `uploadId`, `replaced`) and `event.cover.removed`, both `audit: true`. No URLs, no keys.
- **Event deletion.** `DELETE /events/:eventId` adds the cover key to the keys it already purges after the commit ([photos-architecture.md §5](./photos-architecture.md#event-delete)). The key is taken from the row the delete returns, inside the transaction, so a cover confirmed after the authorization read is still purged.
- **Account deletion.** Prep deletes the events the account organised alone with nobody else in them; it reads each such event's cover key before the row goes and returns it in the same `s3Keys` as the photos and the avatar. Events that are handed over or have another organizer keep their cover.

---

## 6. Orphan reconciler

The daily S3 orphan reconciler ([photos-architecture.md §11](./photos-architecture.md#11-s3-orphan-reconciler)) walks a **registry of owned prefixes** (`src/storage`). Each `OrphanSource` names its prefix, recognises the keys the API could have minted under it, and answers "which of these keys does a row still reference?" with one query per S3 page. The reconciler's safety properties are unchanged and shared: opt-in flag, minimum object age, one batch cap per run across all prefixes, and keys a source does not recognise are never touched. Prefixes may not overlap; a source that breaks that fails the boot.

Images add one rule. A photo's row exists before its object can, so "no row" proves an orphan. A stateless image upload is the opposite: **the object exists before anything references it**, so only its age separates an upload awaiting its confirm from an abandoned one. Two constants close that gap:

- `IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS` (1 h): confirm refuses an object older than this, and discards it.
- `IMAGE_ORPHAN_MIN_AGE_MS` (2 h, twice the window): `ImageOrphanSource.minObjectAgeMs`, a floor under the reconciler's configured age. It holds even with `PHOTO_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS=0`.

So the reconciler can never delete an object that a confirm is still allowed to reference.

---

## 7. Adding a new image type

What the event cover (§5) did, as the recipe for the next one:

1. **Schema:** a nullable, `@unique` `VarChar(255)` key column on the owning model (unique gives the reconciler its index).
2. **Prefix:** a constant ending in `/` (e.g. `EVENT_COVER_S3_KEY_PREFIX = "event-covers/"`) that overlaps no registered prefix.
3. **Module:** import `ImagesModule`.
4. **Service:** authorize the caller with the feature's own rules, then call `createUpload` / `confirmUpload` / `remove` with `{ prefix, ownerId }` and an `ImageSlot` whose `save` is a conditional `updateMany` on the key that was read (throw 409 on `count === 0`). Log the feature's own audit events. `src/users/user-avatar.service.ts` and `src/events/event-cover.service.ts` are the references.
5. **Endpoints:** reuse `CreateImageUploadDto`, `ConfirmImageUploadDto`, `ImageUploadResponseDto`.
6. **Reads:** expose `getDownloadUrl(row.key)` as a nullable URL; never return the key.
7. **Reconciler:** a provider of a few lines, such as `src/events/event-cover-orphan-source.ts`:

   ```ts
   @Injectable()
   export class EventCoverOrphanSource extends ImageOrphanSource {
     constructor(
       registry: OrphanSourceRegistry,
       private readonly prisma: PrismaService,
     ) {
       super(EVENT_COVER_S3_KEY_PREFIX, registry);
     }

     async findReferencedKeys(keys: string[]): Promise<string[]> {
       const rows = await this.prisma.event.findMany({
         where: { coverS3Key: { in: keys } },
         select: { coverS3Key: true },
       });
       return rows.flatMap((row) => (row.coverS3Key ? [row.coverS3Key] : []));
     }
   }
   ```

   and add the new prefix to the expectation in `test/integration/app.integration.spec.ts`, which asserts the prefixes registered at boot.

8. **Deletion of the owning row:** collect the key before the row goes and purge it after the commit, next to the keys that path already purges (`PhotoPurgeService.purgeObjects`).

No infrastructure change is needed: the IAM policy, CORS rule, and lifecycle rule in `infra/main.tf` all cover the whole bucket.
