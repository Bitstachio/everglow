# Uploads — the shared protocol

Event photos, profile avatars and event covers all upload the same way. The API never sees the bytes: it decides whether the upload is allowed, records what it needs, and hands the client a short-lived, narrowly scoped S3 URL. This page is the one place that describes the protocol; [photos-architecture.md](./photos-architecture.md) and [image-uploads.md](./image-uploads.md) cover what is specific to each kind.

## The three steps

1. **Mint.** The client posts the file's `contentType` and `sizeBytes` (a batch of them for photos). The API authorizes the caller for that target, applies the kind's limits, and returns one `uploadUrl` per file plus an `expiresAt`. The URL is signed for one key, the declared type and the declared length. Keys are always derived on the server from the caller's or the event's id, never taken from the client.
2. **Upload.** The client PUTs the bytes to `uploadUrl` with the same `Content-Type` and `Content-Length` it declared. This goes straight to S3. After `expiresAt` the URL is refused and the client mints again.
3. **Confirm.** The client tells the API the upload is done. The API asks S3 whether the object exists and matches what was declared, then makes it live. Confirm is idempotent, so a lost response is safe to retry.

S3 is guaranteed to reject a PUT whose `Content-Type` differs from the signed one. Whether it enforces a signed `Content-Length` on a PUT has not been verified against the bucket, and public reports say it does not, so the API never relies on it: confirm compares the real size and discards a mismatch. The documented way to make S3 itself enforce a size is a presigned POST with a `content-length-range` policy; switching to it would touch only the signing code.

## What differs per kind

|                             | Event photos                                                                                                            | Avatar                                                   | Event cover                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Mint                        | `POST /events/:eventId/photos/upload-urls`                                                                              | `POST /users/me/avatar/upload-url`                       | `POST /events/:eventId/cover/upload-url`                        |
| Who may call it             | event organizer or participant                                                                                          | the user, once onboarded                                 | event organizer                                                 |
| Batch                       | up to 20 files                                                                                                          | one                                                      | one                                                             |
| Limits                      | 25 MB; JPEG, PNG, WebP, HEIC, HEIF                                                                                      | 5 MB; JPEG, PNG, WebP                                    | 5 MB; JPEG, PNG, WebP                                           |
| Counts toward storage quota | yes, from mint                                                                                                          | no                                                       | no                                                              |
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

| Code                             | Status | Kind          | Meaning                                                 |
| -------------------------------- | ------ | ------------- | ------------------------------------------------------- |
| `STORAGE_QUOTA_EXCEEDED`         | 413    | photos        | the batch does not fit under the uploader's limit       |
| `STORAGE_RESERVATION_CONFLICT`   | 409    | photos        | concurrent batches kept colliding; retry                |
| `IMAGE_UNSUPPORTED_CONTENT_TYPE` | 400    | avatar, cover | type not in the image allowlist                         |
| `IMAGE_INVALID_SIZE`             | 400    | avatar, cover | size not a whole number between 1 and the image maximum |
| `IMAGE_UPLOAD_NOT_FOUND`         | 404    | avatar, cover | confirm before the object landed                        |
| `IMAGE_UPLOAD_EXPIRED`           | 422    | avatar, cover | object older than the confirm window; discarded         |
| `IMAGE_UPLOAD_REJECTED`          | 422    | avatar, cover | object of the wrong type or size; discarded             |
| `RATE_LIMIT_EXCEEDED`            | 429    | all           | see [rate-limiting.md](./rate-limiting.md)              |

Photo confirm reports problems per id in its response body instead of failing the request, so it has no codes of its own beyond the verdicts above. Request-shape errors (an unknown field, a size above the maximum in the DTO) are plain 400 validation errors without a code.
