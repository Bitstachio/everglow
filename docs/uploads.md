# Uploads — the shared protocol

Event photos, profile avatars and event covers all upload the same way. The API never sees the bytes: it decides whether the upload is allowed, records what it needs, and hands the client a short-lived, narrowly scoped S3 URL. This page is the one place that describes the protocol; [photos-architecture.md](./photos-architecture.md) and [image-uploads.md](./image-uploads.md) cover what is specific to each kind.

## The three steps

1. **Mint.** The client posts the file's `contentType` and `sizeBytes` (a batch of them for photos). The API authorizes the caller for that target, applies the kind's limits, and returns one `uploadUrl` per file plus an `expiresAt`. The URL is signed for one key, the declared type and the declared length. Keys are always derived on the server from the caller's or the event's id, never taken from the client.
2. **Upload.** The client PUTs the bytes to `uploadUrl` with the same `Content-Type` and `Content-Length` it declared, and `If-None-Match: *`. This goes straight to S3. After `expiresAt` the URL is refused and the client mints again.
3. **Confirm.** The client tells the API the upload is done. The API asks S3 whether the object exists and matches what was declared, then makes it live. For event photos it also reads the object once and records its SHA-256 (below). Confirm is idempotent, so a lost response is safe to retry.

S3 is guaranteed to reject a PUT whose `Content-Type` differs from the signed one. Whether it enforces a signed `Content-Length` on a PUT has not been verified against the bucket, and public reports say it does not, so the API never relies on it: confirm compares the real size and discards a mismatch. The documented way to make S3 itself enforce a size is a presigned POST with a `content-length-range` policy; switching to it would touch only the signing code.

### Each key is written once

The URL is signed with `If-None-Match: *`, an S3 conditional write ([EV-201](https://linear.app/mehrshadfb/issue/EV-201) and the auth review). S3 writes the key only if it holds no object yet. Without it, anyone holding the URL could replace a photo, cover or avatar after it was confirmed, for as long as the URL lived (an hour for photos): confirm's checks, the hash and the evidence would all describe bytes that were no longer there.

- The header is signed, so a PUT without it fails the signature with 403. Every client must send it.
- A second PUT to the same key gets **412 Precondition Failed**. To the client that means an earlier attempt already landed the bytes (a retry after a lost response), so it goes on to confirm, which checks what is stored.
- Two PUTs racing for the same key: one wins, the other gets 409 `ConditionalRequestConflict`; the client retries the PUT, gets 412, and confirms.
- A key emptied by a rejected confirm (`MISMATCHED`) can be written again, but its slot is gone, so nothing can confirm it; the orphan reconciler removes it.

### The photo's hash

Confirm streams each verified photo original from S3 once through SHA-256 and stores it on `Photo.sha256`, a few photos at a time (`PHOTO_HASH_CONCURRENCY`), each read bounded by `PHOTO_HASH_TIMEOUT_MS`. The hash finds identical copies of a removed intimate image ([moderation.md §7](./moderation.md#intimate-images-the-take-it-down-act)). A read that fails or times out never fails the confirm: the photo goes live without a hash, and the hourly backfill job hashes it. The hashing itself costs about 1 ms for a 3 MB photo and 8 ms for 25 MB on the CPU; the read from S3 is most of the cost, roughly the time to download the photo inside the region.

### Upload screening

When `MODERATION_SCREENING_ENABLED=true`, confirm also screens each verified photo with Amazon Rekognition, alongside the hashing, before the batch goes live ([moderation.md §11](./moderation.md#11-upload-screening)). It sends the image processor's display copy (`large.jpg`), or a JPEG or PNG original of 5 MB or less while that isn't written yet. The verdict is written with the `READY` flip, and a flagged photo's automated report in the same transaction. A photo it can't screen yet (no display copy, Rekognition slow or failing) is `READY` but held: only its uploader and the event's organizers see it, and a job retries it every minute for up to 30 minutes. Screening never fails a confirm and never changes its response.

If any photo in a confirm has the bytes of an intimate image the platform removed, the whole confirm answers 422 `PHOTO_REJECTED_MATCHES_REMOVED_IMAGE`. Those uploads are deleted with their renditions and their slots released. Nothing else changes: the other photos stay `PENDING`, so the client confirms the same ids again, gets their verdicts, and the refused ones answer `NOT_FOUND`. The app says only that the photo can't be added.

## What differs per kind

|                             | Event photos                                                                                                            | Avatar                                                   | Event cover                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Mint                        | `POST /events/:eventId/photos/upload-urls`                                                                              | `POST /users/me/avatar/upload-url`                       | `POST /events/:eventId/cover/upload-url`                        |
| Who may call it             | event organizer or participant                                                                                          | the user, once onboarded                                 | event organizer                                                 |
| Batch                       | up to 20 files                                                                                                          | one                                                      | one                                                             |
| Limits                      | 25 MB; JPEG, PNG, WebP, HEIC, HEIF                                                                                      | 5 MB; JPEG, PNG, WebP                                    | 5 MB; JPEG, PNG, WebP                                           |
| Counts toward gallery limit | yes, from mint                                                                                                          | no                                                       | no                                                              |
| Written at mint             | one `PENDING` `Photo` row per file                                                                                      | nothing                                                  | nothing                                                         |
| Mint response               | `[{ photoId, uploadUrl, expiresAt }]`                                                                                   | `{ uploadId, uploadUrl, expiresAt }`                     | `{ uploadId, uploadUrl, expiresAt }`                            |
| URL lifetime                | 1 hour                                                                                                                  | 15 minutes                                               | 15 minutes                                                      |
| Confirm                     | `POST /events/:eventId/photos/confirm` with `photoIds`, per-id verdict `READY` / `MISSING` / `MISMATCHED` / `NOT_FOUND` | `PUT /users/me/avatar` with `uploadId`, returns the user | `PUT /events/:eventId/cover` with `uploadId`, returns the event |
| On a bad object at confirm  | slot released, quota returned                                                                                           | object discarded, 422                                    | object discarded, 422                                           |
| Abandoned upload            | pending row swept (75 min without an object, 24 h with one)                                                             | orphan object reconciled after 2 h                       | orphan object reconciled after 2 h                              |
| Rate limit tier             | `uploads`                                                                                                               | `uploads`                                                | `uploads`                                                       |

Why the ids differ: a `photoId` is a real resource the client reads and deletes later, so the row exists from mint. An `uploadId` is a one-time ticket; nothing exists until confirm sets the key on the profile or the event.

## Error codes

Failures that a client should branch on carry a stable `code` in the error envelope:

| Code                                   | Status | Kind          | Meaning                                                                 |
| -------------------------------------- | ------ | ------------- | ----------------------------------------------------------------------- |
| `EVENT_STORAGE_LIMIT_REACHED`          | 403    | photos        | the batch would take the gallery past its storage limit                 |
| `EVENT_GALLERY_CLOSED`                 | 403    | photos        | the event's gallery has closed                                          |
| `STORAGE_RESERVATION_CONFLICT`         | 409    | photos        | concurrent batches kept colliding; retry                                |
| `IMAGE_UNSUPPORTED_CONTENT_TYPE`       | 400    | avatar, cover | type not in the image allowlist                                         |
| `IMAGE_INVALID_SIZE`                   | 400    | avatar, cover | size not a whole number between 1 and the image maximum                 |
| `IMAGE_UPLOAD_NOT_FOUND`               | 404    | avatar, cover | confirm before the object landed                                        |
| `IMAGE_UPLOAD_EXPIRED`                 | 422    | avatar, cover | object older than the confirm window; discarded                         |
| `IMAGE_UPLOAD_REJECTED`                | 422    | avatar, cover | object of the wrong type or size; discarded                             |
| `PHOTO_REJECTED_MATCHES_REMOVED_IMAGE` | 422    | photos        | the bytes of a removed intimate image; discarded, the rest left pending |
| `RATE_LIMIT_EXCEEDED`                  | 429    | all           | see [rate-limiting.md](./rate-limiting.md)                              |

Photo confirm reports problems per id in its response body instead of failing the request. Its one code is `PHOTO_REJECTED_MATCHES_REMOVED_IMAGE`, which fails the request on purpose: it says nothing about which photo or why. Request-shape errors (an unknown field, a size above the maximum in the DTO) are plain 400 validation errors without a code.
