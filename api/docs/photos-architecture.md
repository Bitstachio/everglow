# Photos — Architecture & v1 Plan

An event has many photos. Photos live in S3; metadata lives in Postgres. The API never proxies image bytes — clients talk to S3 directly using short-lived presigned URLs.

> **2026-08-25:** the intermediate Gallery layer was removed — photos attach directly to events. Paths, schema, and permissions below reflect the current event-scoped design.

---

## 1. Uploading (naive walkthrough)

**Goal:** user picks N photos from their phone, they end up safely in S3 and visible in the event, even if they background the app.

### Steps

1. **Mobile asks API for upload slots.**
   `POST /events/:eventId/photos/upload-urls` with the list of files (just `contentType` and `sizeBytes` per file — not the bytes).
2. **API mints slots.**
   For each file, API:
   - validates contentType allowlist + size cap
   - generates a `photoId` (uuid) and `s3Key = photos/{userId}/{eventId}/{photoId}` (one bucket, one prefix per uploader)
   - inserts a `Photo` row with `status: PENDING`
   - signs an S3 PUT URL (TTL ~1 hour, long enough to survive a backgrounded upload on flaky cellular)
3. **API responds** with `[{ photoId, uploadUrl }, ...]`.
4. **Mobile uploads bytes directly to S3.**
   Uses the OS background uploader (iOS `URLSession` background config, Android `WorkManager`). Each PUT goes straight to S3 — API is not involved. Survives app being backgrounded or killed.
5. **Mobile calls confirm when uploads finish.**
   `POST /events/:eventId/photos/confirm` with `{ photoIds: [...] }`.
6. **API verifies each photo with S3 `HeadObject`.**
   - object exists + size/contentType match → flip row to `READY`
   - missing or mismatched → leave `PENDING` (will be swept) or mark `FAILED`
7. **Done.** Photo shows up in the event on the next list call.

### Why presigned URLs

The client uploads straight to S3 without our API ever seeing the bytes. No bandwidth cost on the API. No memory pressure. Scales to any file size. The URL is cryptographically tied to one specific bucket + key + contentType, so it can't be repurposed.

### S3 key layout

One shared bucket per environment (`everglow-photos-dev`, etc.). Objects are grouped by uploader:

```
photos/{userId}/{eventId}/{photoId}
```

`userId` is the uploader's `addedById`. This keeps each user's objects under one prefix (useful for account deletion sweeps and future per-user lifecycle rules) while events remain the domain boundary in the API. The `s3Key` is stored on the `Photo` row at slot creation and never changes.

### Why a PENDING/READY status

We create the row _before_ the upload happens (so we have a `photoId` to sign against). If the upload never completes, the row would still exist — filtering reads to `READY` hides those, and a cleanup job (or S3 lifecycle rule) eventually deletes them.

---

## 2. Previewing an event's photos (pagination)

**Goal:** user opens an event, sees a grid of photos, scrolls through hundreds without dying.

### Endpoint

`GET /events/:eventId/photos?cursor=<id>&limit=50`

- **Cursor-based pagination** (not offset). Cursor is the `createdAt` + `id` of the last photo returned. Cheaper than `OFFSET N` at large N, and stable when new photos are added mid-scroll.
- **Filters to `status = READY`** automatically. Pending/failed photos are invisible.
- **Default sort:** newest first (`createdAt DESC, id DESC`).

### Response

```json
{
  "items": [{ "id": "...", "url": "https://s3...", "contentType": "image/jpeg", "createdAt": "..." }],
  "nextCursor": "..."
}
```

Each `url` is a freshly-signed S3 GET URL (TTL ~15min). We don't store URLs — sign them on every request. Signing is cheap (no network call, pure crypto).

### Why no thumbnails in v1

Modern mobile image libs (RN `FastImage`, Expo `Image`) lazy-load only visible tiles and cache aggressively. A 50-photo grid loads ~10 visible photos on first paint, caches them forever after. Adding a thumbnail pipeline now is overengineering. Revisit if real usage shows it's slow.

### Why square grid + `object-fit: cover`

We don't store image dimensions. Apple-Photos-style uniform square grid lets the client crop on display without knowing aspect ratio. Simpler schema, no client-supplied metadata to validate.

---

## 3. Downloading (per image)

**Goal:** user taps a photo, sees it full-size with zoom.

### Endpoint

`GET /photos/:photoId`

- Returns single photo metadata + presigned GET URL (TTL ~15min).
- Same URL pattern as the grid — there's only one stored object per photo. Mobile decides display size; S3 always returns the original.

### Why not a "download original" vs "view" distinction

Without thumbnails, there's only one file. Grid and detail view fetch the same object; the image lib downsamples in memory for the grid and uses full pixels for the detail view. One source of truth.

### Caching

Mobile image lib caches by URL — but presigned URLs change every request (signature differs), defeating the cache. Two options for later:

- Cache by `photoId` instead of URL (most libs support custom cache keys).
- Return a stable CDN URL via CloudFront, with signed cookies instead of query-string signatures.

Out of scope for v1. The cold-load hit is acceptable for now.

---

## 4. Schema (Prisma)

```prisma
model Photo {
  id          String      @id @default(uuid())
  eventId     String
  event       Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  s3Key       String      @unique
  contentType String
  sizeBytes   Int
  status      PhotoStatus @default(PENDING)
  createdAt   DateTime    @default(now())

  @@index([eventId, status, createdAt])
}

enum PhotoStatus {
  PENDING
  READY
}
```

Composite index supports the paginated list query (`WHERE eventId = ? AND status = 'READY' ORDER BY createdAt DESC`).

---

## 5. Delete

`DELETE /photos/:photoId`

1. Verify caller can delete the photo (CASL: organizer any, uploader own).
2. Delete S3 object.
3. Delete DB row.

Order matters: if step 2 fails, row stays — operation is retry-safe. If step 3 fails after step 2 succeeds, we have a row pointing at nothing — list still works (presigned URL would 404 on read, edge case to handle later).

---

## 6. Edge cases handled in v1

| Case                                       | Mitigation                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Client uploads, never confirms             | Row stuck PENDING. List filters to READY. Cleanup later (see TODO).                                      |
| Client confirms without uploading          | `HeadObject` returns 404 → confirm reports MISSING for that photoId.                                     |
| Wrong contentType / oversize file          | Enforced at presign time (contentType signed in). HeadObject re-verifies at confirm.                     |
| Upload completes but confirm response lost | Confirm is idempotent — already-READY photoIds return READY again.                                       |
| Event deleted with pending uploads         | `onDelete: Cascade` removes rows. S3 objects are orphaned until the daily reconciler removes them (§10). |
| App killed mid-upload                      | OS background uploader resumes. Presigned URL TTL is 1h to give it room.                                 |
| Two devices upload simultaneously          | Each has its own photoId. No conflict.                                                                   |
| Presigned URL leaked                       | TTL 1h, limited to one specific key + contentType. Worst case: attacker uploads junk to one key.         |

---

## 7. Improvements (deferred past v1)

These are explicitly **not** being built now. Listed so we know what we're skipping and why.

### Server-side

- **S3 Event Notifications** for confirm. Replace client `/confirm` with EventBridge → API webhook → flip READY. More reliable but requires infra.
- **Multipart upload** for files >5MB. Lets uploads resume after network drops. Worth it once average photo size grows.
- **Async processing queue** (SQS) for any post-upload work (EXIF strip, virus scan, ML tagging).
- **S3 lifecycle rule** to auto-delete `pending/*` keys after 24h. One-time bucket config, no code. (Could ship as part of v1 if we add a `pending/` prefix.)
- **Idempotency keys** on `/upload-urls` so retried requests don't mint duplicate rows.
- **Per-event quota** checks (count and total bytes) before issuing upload slots.
- **Rate limiting** on `/upload-urls` to prevent abuse.

### Reads / performance

- **Thumbnail generation** (server-side via `sharp` at confirm time, or on-the-fly via S3 Object Lambda + CloudFront). Add when grid scroll feels slow on cellular.
- **CloudFront distribution** with signed cookies. Replaces per-request presigned URLs with stable CDN URLs that cache well on mobile.
- **EXIF stripping** for privacy (location data on photos).
- **Width/height stored at confirm** if mobile ever needs non-square layouts.

### Reliability

- **Cleanup sweeper** — cron job that deletes PENDING rows older than 24h and their S3 objects. Or replace with S3 lifecycle rule.
- ~~**Orphan reconciler** — periodic scan that finds S3 objects without matching DB rows (e.g., from failed deletes) and removes them.~~ Implemented: `PhotoOrphanReconcilerService` runs daily via `@nestjs/schedule` (§10).

### Mobile-side (not server concern, listed for completeness)

- Optimistic UI — show photo in grid using local file URI the moment upload starts, swap to remote URL after confirm.
- Custom cache key (by `photoId`) so cache survives URL re-signing.
- Background upload via native OS APIs.

---

## 8. TODOs for v1

In order of implementation:

- [x] **Prisma schema** — add `Photo` model + `PhotoStatus` enum + composite index. Generate migration. (Reshaped the pre-existing `Photo` model; kept `addedById` for attribution and delete-own-photo rules.)
- [x] **CASL** — register `Photo` subject. Permissions derive from the parent `Event`'s access levels. (Read: any member. Create: organizer + participant. Delete: organizer any, uploader own.)
- [x] **`S3Service.headObject`** — existence + size/contentType lookup used by confirm. (Prerequisite discovered during implementation.)
- [x] **Photos module skeleton** — `photos.module.ts`, `photos.service.ts`, `photos.controller.ts`, DTOs. Mirror the existing `events` module shape.
- [x] **`POST /events/:eventId/photos/upload-urls`** — batch mint presigned PUT URLs (1h TTL), create PENDING rows in one transaction. Enforce contentType allowlist + max size + max batch size.
- [x] **`POST /events/:eventId/photos/confirm`** — batch HeadObject verify, flip to READY, return per-photoId result (`READY` / `MISSING` / `MISMATCHED` / `NOT_FOUND`).
- [x] **`GET /events/:eventId/photos`** — cursor-paginated list of READY photos with presigned GET URLs.
- [x] **`GET /photos/:photoId`** — single photo with presigned GET URL. Non-READY photos 404, matching list invisibility.
- [x] **`DELETE /photos/:photoId`** — S3 delete then row delete.
- [x] **Per-user storage quota** — 5 GiB free tier enforced at upload-urls; `GET /users/me/storage` for usage.
- [x] **Orphan reconciler** — daily scan deletes S3 objects under `photos/` that no `Photo` row references (§10).
- [x] **Unit tests** — service-level, mock `S3Service` and `PrismaService`.
- [x] **E2E tests** — controller-level, with auth + CASL.
- [x] **OpenAPI regen** — `npm run openapi:generate` so mobile picks up the new contract. (Regenerated alongside each endpoint; request DTOs need explicit `@ApiProperty` — the swagger CLI plugin does not run under the ts-node openapi script.)
- [x] **README update** — implementation status is tracked in this checklist.

### Out of scope for v1 (tracked as future work)

- Cleanup sweeper for PENDING rows
- Idempotency keys
- Per-user paid storage upgrades (billing)
- Thumbnails
- CloudFront
- S3 Event-driven confirm
- Multipart upload

---

## 9. Per-user storage quota (free tier)

Each uploader has a storage cap (default **5 GiB**) enforced before upload slots are minted.

- **Usage:** `SUM(sizeBytes)` over the caller's photos with `status IN (PENDING, READY)`. Pending rows count so clients cannot bypass the cap by minting slots without confirming.
- **Enforcement:** `PhotoStorageService.assertCanUpload()` in `PhotosService.createUploadSlots()`, after CASL authorization.
- **Read API:** `GET /users/me/storage` returns `usedBytes`, `limitBytes`, and `remainingBytes` as strings (bigint-safe JSON).
- **Config:** `PHOTO_STORAGE_LIMIT_BYTES` overrides the default limit for all users until billing ships per-user limits.

Over-quota uploads return **413 Payload Too Large** with message `Storage quota exceeded`.

---

## 10. S3 orphan reconciler

Postgres is the source of truth for photos, so a row can disappear while its object stays in the bucket: an event delete (`onDelete: Cascade` removes the rows, nothing touches S3), an account delete (same cascade), a row removed by hand, or objects left under the pre-#38 `photos/{eventId}/{photoId}` layout. Orphans never count toward quota (usage is a `SUM` over rows) but they are billed, so a daily job reclaims them.

- **Service:** `PhotoOrphanReconcilerService.reconcileOrphanedObjects()`
- **Schedule:** daily at 03:00 via `PhotoOrphanReconcilerScheduler` (`@nestjs/schedule`). Every run lists the whole prefix, which is not worth doing hourly, and orphans cost money rather than correctness.
- **Walk:** `S3Service.listObjects()` (`ListObjectsV2`) under `photos/`, one page of up to 1000 keys at a time, end to end on every run. Nothing is loaded into memory beyond the current page.
- **Candidates:** keys shaped like `photos/{userId}/{eventId}/{photoId}` or the legacy `photos/{eventId}/{photoId}` (UUID segments, `isPhotoS3Key()`), with `LastModified` older than `PHOTO_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS` (default **24h**, `0` disables the buffer). Anything else under the prefix is skipped and never deleted.
- **Lookup:** one `Photo.findMany({ s3Key: { in } })` per page. `s3Key` is unique, so this is an index probe per key without a round trip per key. A key with a row in **any** status is left alone; `PENDING` rows belong to the stale-PENDING cleanup.
- **Delete:** `DeleteObject` per orphan, at most `PHOTO_ORPHAN_RECONCILER_BATCH_SIZE` per run (default **100**). The cap bounds the blast radius of a bad run more than the work: when it is hit the summary reports `completed: false` and the next run picks up the rest. Failed deletes count against the cap and are retried next run.
- **Enable:** `PHOTO_ORPHAN_RECONCILER_ENABLED=true`. Off unless set to exactly that, because the
  job decides what to delete from `AWS_S3_BUCKET` using rows in `DATABASE_URL`, and the two are only
  paired in a deployed environment. `docker-compose.yml` overrides `DATABASE_URL` to its own empty
  database while still loading the shared bucket credentials from `.env`, and local dev does the same,
  so an on-by-default sweep would delete another environment's live photos. The bucket has no
  versioning, so those deletes are final. Gating on `NODE_ENV` would not help: compose sets it to
  `production`.
- **IAM:** needs `s3:ListBucket` on the bucket, which Terraform already grants (`infra/main.tf`).

Every deletion logs `photo.orphan_reconcile.deleted` with `audit: true`; every run ends with `photo.orphan_reconcile.completed` carrying the counts, so a quiet bucket still leaves a daily trace.

### Why "no row" is enough to delete

A `Photo` row is inserted before its upload URL is minted (§1), so an object can only exist after its row did. When the lookup finds no row, the row was deleted afterwards, which is exactly the orphan case. The minimum age is belt and braces for clock skew and for an upload that finished moments before the scan. The manual delete path (§5) removes the object before the row, so it rarely produces orphans on its own.

### Not the stale-PENDING cleanup

The two jobs start from opposite sides and stay separate services, schedulers, and config:

|             | Stale PENDING cleanup (§7, separate branch until it lands) | Orphan reconciler                   |
| ----------- | ---------------------------------------------------------- | ----------------------------------- |
| Starts from | Postgres                                                   | S3                                  |
| Finds       | `PENDING` rows older than 24h                              | objects under `photos/` with no row |
| Deletes     | S3 object, then the row                                    | S3 object only                      |
| Fixes       | abandoned uploads that still count toward quota            | billed bytes nobody references      |
| Ignores     | objects without rows                                       | rows, whatever their status         |

They cannot fight over an object: the reconciler deletes only when no row exists, and the cleanup only touches keys whose row it has just read.

### Out of scope

Eager S3 cleanup when an event or account is deleted, S3 Inventory or Athena-based reconciliation for very large buckets, and an endpoint to trigger a run by hand.
