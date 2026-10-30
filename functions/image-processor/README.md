# Photo derivative worker

Independently deployed Lambda for event photo derivatives. Product architecture and cleanup are documented in [photos-architecture.md](../../docs/photos-architecture.md#derivative-generation-ev-5); privacy controls are in [photo-privacy.md](../../docs/photo-privacy.md).

## Ownership and structure

The Nest API owns authorization, upload reservations and confirmation, Prisma rows, quotas, moderation evidence and orphan reconciliation. This worker only transforms S3 originals and removes their derived copies. It has no HTTP endpoints, database connection or Nest bootstrap. It uses its Lambda role through the AWS SDK credential chain; do not copy API access keys into its configuration.

| File                                               | Responsibility                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/index.ts`                                     | Lambda wiring, SQS/S3 event decoding, per-message logs and partial-batch retries |
| `src/photo-derivative.service.ts`                  | S3 derivative lifecycle, with S3 client and logger injected                      |
| `src/derivatives.ts`                               | Pure image processing: rotate, resize and strip metadata                         |
| `src/keys.ts`                                      | Original-to-derivative key mapping                                               |
| `src/logging.ts`                                   | Pino configuration for this runtime                                              |
| `src/*.spec.ts`                                    | Colocated unit and worker-boundary regression tests                              |
| `scripts/build-lambda.mjs`                         | Deployment ZIP with Linux ARM64 Sharp binaries                                   |
| `api/src/photos/photo-derivative-orphan-source.ts` | API-owned cleanup backstop; uses the existing source registry                    |
| `api/infra/image-processor.tf`                     | Queue, role, Lambda and S3 notification resources                                |

Paths in the final two rows are relative to the repository root. The Lambda does not import API source files. The handler reuses its SDK client across warm invocations; each message gets a service with a correlated logger. Domain processing throws failures; the handler logs each failure once and returns its SQS message ID for retry. Missing originals trigger cleanup; denied access remains a failure.

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

Use Pino structured fields and stable dotted `event` names, following [backend logging conventions](../../api/docs/logging-conventions.md). Logs include `service`, `env`, `awsRequestId` and `messageId`. Successful cleanup carries `audit: true`. Ignore notifications at debug level; processing failures at error level identify the error type without dumping raw errors, event bodies, credentials or image bytes. `LOG_LEVEL` overrides the environment default; tests default to silent.

Pino is configured here because this runtime has no Nest HTTP middleware. The API's HTTP logger remains in `api/src/common/logging/logging.config.ts`. Keep credential/contact-field redaction consistent between the two runtimes.

## Deployment

Build `dist/function.zip` before planning the Terraform in `api/infra/`, using the latest shared dev state. Building is local; deploying requires a separate Terraform apply. Ship the API orphan source with its reconciler enabled as well as the worker/removal notification changes to activate both cleanup paths.

Generation runs on S3 object creation, before upload confirmation, and does not make an image visible in the API. API derivative URL fields, mobile use, HEIC decoding and backfill remain part of EV-5.
