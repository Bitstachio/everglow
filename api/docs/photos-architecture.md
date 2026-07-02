# Photos — Architecture & v1 Plan

A gallery has many photos. Photos live in S3; metadata lives in Postgres. The API never proxies image bytes — clients talk to S3 directly using short-lived presigned URLs.

---

## 1. Uploading (naive walkthrough)

**Goal:** user picks N photos from their phone, they end up safely in S3 and visible in the gallery, even if they background the app.

### Steps

1. **Mobile asks API for upload slots.**
   `POST /galleries/:galleryId/photos/upload-urls` with the list of files (just `contentType` and `sizeBytes` per file — not the bytes).
2. **API mints slots.**
   For each file, API:
   - validates contentType allowlist + size cap
   - generates a `photoId` (uuid) and `s3Key = photos/{galleryId}/{photoId}`
   - inserts a `Photo` row with `status: PENDING`
   - signs an S3 PUT URL (TTL ~1 hour, long enough to survive a backgrounded upload on flaky cellular)
3. **API responds** with `[{ photoId, uploadUrl }, ...]`.
4. **Mobile uploads bytes directly to S3.**
   Uses the OS background uploader (iOS `URLSession` background config, Android `WorkManager`). Each PUT goes straight to S3 — API is not involved. Survives app being backgrounded or killed.
5. **Mobile calls confirm when uploads finish.**
   `POST /galleries/:galleryId/photos/confirm` with `{ photoIds: [...] }`.
6. **API verifies each photo with S3 `HeadObject`.**
   - object exists + size/contentType match → flip row to `READY`
   - missing or mismatched → leave `PENDING` (will be swept) or mark `FAILED`
7. **Done.** Photo shows up in the gallery on the next list call.

### Why presigned URLs

The client uploads straight to S3 without our API ever seeing the bytes. No bandwidth cost on the API. No memory pressure. Scales to any file size. The URL is cryptographically tied to one specific bucket + key + contentType, so it can't be repurposed.

### Why a PENDING/READY status

We create the row *before* the upload happens (so we have a `photoId` to sign against). If the upload never completes, the row would still exist — filtering reads to `READY` hides those, and a cleanup job (or S3 lifecycle rule) eventually deletes them.

---

## 2. Previewing the gallery (pagination)

**Goal:** user opens a gallery, sees a grid of photos, scrolls through hundreds without dying.

### Endpoint

`GET /galleries/:galleryId/photos?cursor=<id>&limit=50`

- **Cursor-based pagination** (not offset). Cursor is the `createdAt` + `id` of the last photo returned. Cheaper than `OFFSET N` at large N, and stable when new photos are added mid-scroll.
- **Filters to `status = READY`** automatically. Pending/failed photos are invisible.
- **Default sort:** newest first (`createdAt DESC, id DESC`).

### Response

```json
{
  "items": [
    { "id": "...", "url": "https://s3...", "contentType": "image/jpeg", "createdAt": "..." }
  ],
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
  galleryId   String
  gallery     Gallery     @relation(fields: [galleryId], references: [id], onDelete: Cascade)
  s3Key       String      @unique
  contentType String
  sizeBytes   Int
  status      PhotoStatus @default(PENDING)
  createdAt   DateTime    @default(now())

  @@index([galleryId, status, createdAt])
}

enum PhotoStatus {
  PENDING
  READY
}
```

Composite index supports the paginated list query (`WHERE galleryId = ? AND status = 'READY' ORDER BY createdAt DESC`).

---

## 5. Delete

`DELETE /photos/:photoId`

1. Verify caller can edit the parent gallery (CASL).
2. Delete S3 object.
3. Delete DB row.

Order matters: if step 2 fails, row stays — operation is retry-safe. If step 3 fails after step 2 succeeds, we have a row pointing at nothing — list still works (presigned URL would 404 on read, edge case to handle later).

---

## 6. Edge cases handled in v1

| Case | Mitigation |
|---|---|
| Client uploads, never confirms | Row stuck PENDING. List filters to READY. Cleanup later (see TODO). |
| Client confirms without uploading | `HeadObject` returns 404 → confirm reports MISSING for that photoId. |
| Wrong contentType / oversize file | Enforced at presign time (contentType signed in). HeadObject re-verifies at confirm. |
| Upload completes but confirm response lost | Confirm is idempotent — already-READY photoIds return READY again. |
| Gallery deleted with pending uploads | `onDelete: Cascade` removes rows. S3 objects orphaned (cleanup later). |
| App killed mid-upload | OS background uploader resumes. Presigned URL TTL is 1h to give it room. |
| Two devices upload simultaneously | Each has its own photoId. No conflict. |
| Presigned URL leaked | TTL 1h, limited to one specific key + contentType. Worst case: attacker uploads junk to one key. |

---

## 7. Improvements (deferred past v1)

These are explicitly **not** being built now. Listed so we know what we're skipping and why.

### Server-side
- **S3 Event Notifications** for confirm. Replace client `/confirm` with EventBridge → API webhook → flip READY. More reliable but requires infra.
- **Multipart upload** for files >5MB. Lets uploads resume after network drops. Worth it once average photo size grows.
- **Async processing queue** (SQS) for any post-upload work (EXIF strip, virus scan, ML tagging).
- **S3 lifecycle rule** to auto-delete `pending/*` keys after 24h. One-time bucket config, no code. (Could ship as part of v1 if we add a `pending/` prefix.)
- **Idempotency keys** on `/upload-urls` so retried requests don't mint duplicate rows.
- **Per-gallery quota** checks (count and total bytes) before issuing upload slots.
- **Rate limiting** on `/upload-urls` to prevent abuse.

### Reads / performance
- **Thumbnail generation** (server-side via `sharp` at confirm time, or on-the-fly via S3 Object Lambda + CloudFront). Add when grid scroll feels slow on cellular.
- **CloudFront distribution** with signed cookies. Replaces per-request presigned URLs with stable CDN URLs that cache well on mobile.
- **EXIF stripping** for privacy (location data on photos).
- **Width/height stored at confirm** if mobile ever needs non-square layouts.

### Reliability
- **Cleanup sweeper** — cron job that deletes PENDING rows older than 24h and their S3 objects. Or replace with S3 lifecycle rule.
- **Orphan reconciler** — periodic scan that finds S3 objects without matching DB rows (e.g., from failed deletes) and removes them.

### Mobile-side (not server concern, listed for completeness)
- Optimistic UI — show photo in grid using local file URI the moment upload starts, swap to remote URL after confirm.
- Custom cache key (by `photoId`) so cache survives URL re-signing.
- Background upload via native OS APIs.

---

## 8. TODOs for v1

In order of implementation:

- [ ] **Prisma schema** — add `Photo` model + `PhotoStatus` enum + composite index. Generate migration.
- [ ] **CASL** — register `Photo` subject. Permissions inherit from parent `Gallery` (can manage gallery → can manage its photos).
- [ ] **Photos module skeleton** — `photos.module.ts`, `photos.service.ts`, `photos.controller.ts`, DTOs. Mirror the existing `galleries` module shape.
- [ ] **`POST /galleries/:galleryId/photos/upload-urls`** — batch mint presigned PUT URLs (1h TTL), create PENDING rows in one transaction. Enforce contentType allowlist + max size + max batch size.
- [ ] **`POST /galleries/:galleryId/photos/confirm`** — batch HeadObject verify, flip to READY, return per-photoId result.
- [ ] **`GET /galleries/:galleryId/photos`** — cursor-paginated list of READY photos with presigned GET URLs.
- [ ] **`GET /photos/:photoId`** — single photo with presigned GET URL.
- [ ] **`DELETE /photos/:photoId`** — S3 delete then row delete.
- [ ] **Unit tests** — service-level, mock `S3Service` and `PrismaService`.
- [ ] **E2E tests** — controller-level, with auth + CASL.
- [ ] **OpenAPI regen** — `npm run openapi:generate` so mobile picks up the new contract.
- [ ] **README update** — short note in `api/docs/` linking to this plan.

### Out of scope for v1 (tracked as future work)
- Cleanup sweeper for PENDING rows
- Idempotency keys
- Per-gallery quotas
- Thumbnails
- CloudFront
- S3 Event-driven confirm
- Multipart upload
