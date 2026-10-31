import { S3Client } from "@aws-sdk/client-s3";
import type { S3Event, SQSBatchResponse, SQSHandler, SQSRecord } from "aws-lambda";
import type { Logger } from "pino";
import { PhotoProcessingError, UndecodablePhotoError } from "./errors.js";
import { PHOTO_KEY_PREFIX } from "./keys.js";
import { createLogger } from "./logging.js";
import { PhotoDerivativeService } from "./photo-derivative.service.js";

const parseS3Event = (body: string): S3Event | undefined => {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null || !("Records" in parsed) || !Array.isArray(parsed.Records)) {
    return undefined;
  }
  return parsed as S3Event;
};

/** A record's retryable failure, carrying its object for the failure log. */
class RecordFailure extends Error {
  override name = "RecordFailure";

  constructor(
    readonly bucket: string,
    readonly key: string,
    cause: unknown,
  ) {
    super("Photo record failed", { cause });
  }
}

/**
 * Loggable fields for a failure. A message is logged only when this worker
 * wrote it: SDK, JSON and other errors can echo request or body content, so
 * they contribute only their type and HTTP status.
 */
const failureFields = (error: unknown) => {
  const cause = error instanceof RecordFailure ? error.cause : error;
  const status =
    typeof cause === "object" && cause !== null && "$metadata" in cause
      ? (cause.$metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode
      : undefined;
  return {
    ...(error instanceof RecordFailure ? { bucket: error.bucket, key: error.key } : {}),
    errorType: cause instanceof Error ? cause.name : "UnknownError",
    ...(status === undefined ? {} : { httpStatusCode: status }),
    ...(cause instanceof PhotoProcessingError ? { errorMessage: cause.message } : {}),
  };
};

const processMessage = async (message: SQSRecord, service: PhotoDerivativeService, logger: Logger): Promise<void> => {
  const notification = parseS3Event(message.body);
  if (!notification) {
    logger.debug(
      { event: "photo.derivatives.notification_ignored", messageId: message.messageId },
      "Ignored setup notification",
    );
    return;
  }

  for (const record of notification.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replaceAll("+", " "));
    const created = record.eventName.startsWith("ObjectCreated:");
    const removed = record.eventName.startsWith("ObjectRemoved:");
    if ((!created && !removed) || !key.startsWith(PHOTO_KEY_PREFIX)) {
      logger.debug(
        { event: "photo.derivatives.notification_ignored", messageId: message.messageId },
        "Ignored unrelated notification",
      );
      continue;
    }
    try {
      if (removed) await service.removeForMissingOriginal(bucket, key);
      else await service.processOriginal(bucket, key);
    } catch (error: unknown) {
      if (!(error instanceof UndecodablePhotoError)) throw new RecordFailure(bucket, key, error);
      // The same bytes fail the same way on every attempt: log once and acknowledge.
      logger.warn(
        { event: "photo.derivatives.undecodable", bucket, key, reason: error.reason, errorMessage: error.message },
        "Photo cannot be decoded; not retrying",
      );
    }
  }
};

/**
 * The SQS boundary: correlate logs and retry only messages that may succeed
 * later. Undecodable photos are acknowledged in processMessage.
 */
export const createHandler =
  (s3: Pick<S3Client, "send">, logger: Logger): SQSHandler =>
  async (event, context): Promise<SQSBatchResponse> => {
    const invocationLogger = logger.child({ awsRequestId: context.awsRequestId });
    const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];
    for (const message of event.Records) {
      const messageLogger = invocationLogger.child({ messageId: message.messageId });
      const service = new PhotoDerivativeService(s3, messageLogger);
      try {
        await processMessage(message, service, messageLogger);
      } catch (error: unknown) {
        // Never log the message body or an arbitrary SDK/decoder error payload.
        messageLogger.error(
          { event: "photo.derivatives.failed", ...failureFields(error) },
          "Photo derivative processing failed",
        );
        batchItemFailures.push({ itemIdentifier: message.messageId });
      }
    }
    return { batchItemFailures };
  };

// Reuse SDK connections across warm invocations; credentials come from the Lambda role.
export const handler: SQSHandler = createHandler(new S3Client({}), createLogger());
