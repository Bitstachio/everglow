# Photo derivative worker

Independently deployed Lambda for event photo derivatives. Product architecture and cleanup are documented in [photos-architecture.md](../../docs/photos-architecture.md#derivative-generation-ev-5); privacy controls are in [photo-privacy.md](../../docs/photo-privacy.md).

## Ownership and structure

The Nest API owns authorization, upload reservations and confirmation, Prisma rows, quotas, moderation evidence and orphan reconciliation. This worker only transforms S3 originals and removes their derived copies. It has no HTTP endpoints, database connection or Nest bootstrap. It uses its Lambda role through the AWS SDK credential chain; do not copy API access keys into its configuration.

| File                                               | Responsibility                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/index.ts`                                     | Lambda wiring, SQS/S3 event decoding, per-message logs and partial-batch retries |
| `src/photo-derivative.service.ts`                  | S3 derivative lifecycle, with S3 client and logger injected                      |
| `src/derivatives.ts`                               | Pure image processing: rotate, resize and strip metadata                         |
| `src/errors.ts`                                    | Permanent (undecodable) versus retryable failures; decoder message sanitising    |
| `src/keys.ts`                                      | Original-to-derivative key mapping                                               |
| `src/logging.ts`                                   | Pino configuration for this runtime                                              |
| `src/*.spec.ts`                                    | Colocated unit and worker-boundary regression tests                              |
| `scripts/build-lambda.mjs`                         | Deployment ZIP with Linux ARM64 Sharp binaries                                   |
| `api/src/photos/photo-derivative-orphan-source.ts` | API-owned cleanup backstop; uses the existing source registry                    |
| `api/infra/image-processor.tf`                     | Queue, role, Lambda and S3 notification resources                                |

Paths in the final two rows are relative to the repository root. The Lambda does not import API source files. The handler reuses its SDK client across warm invocations; each message gets a service with a correlated logger. Domain processing throws failures, and each is logged once:

- **Undecodable** originals (`UndecodablePhotoError`) are acknowledged, not retried: the same bytes fail the same way. That covers an empty object, a format the upload API does not accept (including HEVC HEIC, which Sharp's prebuilt libvips cannot decode until EV-5), corrupt data, and more than `MAX_INPUT_PIXELS` (128 MP).
- **Anything else** (S3/SDK, network, unrecognised Sharp errors) returns the SQS message ID for retry. After 5 receives the message moves to the DLQ, whose depth alarm notifies the alerts topic.

Missing originals trigger cleanup; denied access remains a failure.

Each photo is decoded once: the original is rotated and shrunk to the 2048 px box as raw pixels, the large JPEG is encoded from those pixels and the thumbnail is resized from them. Reported `width`/`height` are the large rendition's, after EXIF rotation.

## Local checks

Use Node.js 22 and pnpm 11.25.0 from this directory:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm process-local /absolute/path/to/photo.jpg /tmp/everglow-derived
pnpm build
```

`process-local` transforms a local file without AWS access. `invoke` is an AWS-backed smoke harness; set `AWS_S3_BUCKET` and `PHOTO_S3_KEY` explicitly, then supply authorized AWS credentials. It reads that original and writes its derived objects in the real bucket. It exits unsuccessfully if the message fails.

Tests use injected SDK instances and synthetic images, with no AWS credentials or network calls. CI runs formatting, lint, typechecking, tests and packaging, then validates Terraform. Formatting matches `api/.prettierrc`; lint applies the API's general TypeScript and arrow-function rules. Nest HTTP exception rules apply only inside the API.

## Logging

Use Pino structured fields and stable dotted `event` names, following [backend logging conventions](../../api/docs/logging-conventions.md). Logs include `service`, `env`, `awsRequestId` and `messageId`. Successful cleanup carries `audit: true`. Ignore notifications at debug level. Undecodable photos log `photo.derivatives.undecodable` at warn with `bucket`, `key`, `reason` and a sanitised decoder message. Retryable failures log `photo.derivatives.failed` at error with `bucket` and `key` (when the notification parsed), `errorType`, any HTTP status, and a message only when this worker wrote it. Raw errors, event bodies, SDK payloads, credentials and image bytes are never logged. `LOG_LEVEL` overrides the environment default; tests default to silent. The Lambda sets `NODE_ENV=production` and `LOG_LEVEL=info`.

Pino is configured here because this runtime has no Nest HTTP middleware. The API's HTTP logger remains in `api/src/common/logging/logging.config.ts`. Keep credential/contact-field redaction consistent between the two runtimes.

## Deployment

Build `dist/function.zip` before planning the Terraform in `api/infra/`, using the latest shared dev state. The build installs Sharp's Linux ARM64 (glibc) binaries from `pnpm-lock.yaml` with `--frozen-lockfile` and writes a deterministic ZIP (sorted entries, fixed timestamps and modes), then prints its SHA-256. Two builds of the same commit produce the same bytes, so Terraform's `source_code_hash` changes only with the code or lockfile. Building is local; deploying requires a separate Terraform apply. Ship the API orphan source with its reconciler enabled as well as the worker/removal notification changes to activate both cleanup paths.

Generation runs on S3 object creation, before upload confirmation, and does not make an image visible in the API. API derivative URL fields, mobile use, HEIC decoding and backfill remain part of EV-5.
