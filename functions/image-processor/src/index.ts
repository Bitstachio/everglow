import type { S3Event, SQSHandler } from "aws-lambda";

/** Originals only. Derivative writes must not re-enter this job. */
const PHOTO_KEY_PREFIX = "photos/";

const decodeS3Key = (key: string) => decodeURIComponent(key.replaceAll("+", " "));

const parseS3Event = (body: string): S3Event | undefined => {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null || !("Records" in parsed)) {
    return undefined;
  }
  if (!Array.isArray(parsed.Records)) {
    return undefined;
  }
  return parsed as S3Event;
};

/**
 * SQS consumer for S3 ObjectCreated notifications on the photos bucket.
 * Thumbnail generation comes later; this only records that an original arrived.
 */
export const handler: SQSHandler = async (event) => {
  for (const message of event.Records) {
    const notification = parseS3Event(message.body);
    if (!notification) {
      console.log("image-processor ignored message", { messageId: message.messageId });
      continue;
    }

    for (const record of notification.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeS3Key(record.s3.object.key);

      if (!record.eventName.startsWith("ObjectCreated:") || !key.startsWith(PHOTO_KEY_PREFIX)) {
        console.log("image-processor ignored object", {
          bucket,
          key,
          eventName: record.eventName,
        });
        continue;
      }

      console.log("image-processor received image", {
        bucket,
        key,
        eventName: record.eventName,
        messageId: message.messageId,
      });
    }
  }
};
