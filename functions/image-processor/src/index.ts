import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  S3Event,
  SQSBatchResponse,
  SQSEvent,
  SQSHandler,
  SQSRecord,
} from "aws-lambda";

import { createDerivatives } from "./derivatives.js";
import { derivedKeysForOriginal, PHOTO_KEY_PREFIX } from "./keys.js";

const s3 = new S3Client({});

const decodeS3Key = (key: string) =>
  decodeURIComponent(key.replaceAll("+", " "));

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

const bodyToBuffer = async (body: unknown): Promise<Buffer> => {
  if (body === undefined || body === null) {
    throw new Error("S3 GetObject returned an empty body");
  }
  // Prefer the SDK v3 stream helper; Buffer/Uint8Array checks can mis-handle stream objects.
  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  throw new Error("unsupported S3 body type");
};

// ListBucket permission makes a missing original a 404; a 403 is never absence.
const isMissing = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "$metadata" in error &&
  (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404;

const originalExists = async (
  bucket: string,
  key: string,
): Promise<boolean> => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
};

const removeDerivatives = async (
  bucket: string,
  key: string,
): Promise<void> => {
  const keys = derivedKeysForOriginal(key);
  // Wait for both requests, even if one fails, before returning the SQS result.
  const results = await Promise.allSettled(
    Object.values(keys).map((Key) =>
      s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })),
    ),
  );
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
};

const processOriginal = async (bucket: string, key: string): Promise<void> => {
  const derived = derivedKeysForOriginal(key);

  let got;
  try {
    got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (!isMissing(error)) throw error;
    // Upload notifications can arrive after a photo, account or gallery purge.
    await removeDerivatives(bucket, key);
    return;
  }
  if (got.ContentLength === 0) {
    throw new Error(`S3 object is empty (0 bytes): s3://${bucket}/${key}`);
  }
  const original = await bodyToBuffer(got.Body);
  if (original.byteLength === 0) {
    throw new Error(`S3 GetObject decoded to 0 bytes: s3://${bucket}/${key}`);
  }
  const { thumbWebp, largeJpeg } = await createDerivatives(original);

  const writes = await Promise.allSettled([
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: derived.thumb,
        Body: thumbWebp,
        ContentType: "image/webp",
      }),
    ),
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: derived.large,
        Body: largeJpeg,
        ContentType: "image/jpeg",
      }),
    ),
  ]);

  // A removal notification may finish while we decode/write. Check after ALL
  // writes settle so that it cannot leave a late derivative behind.
  if (!(await originalExists(bucket, key))) {
    await removeDerivatives(bucket, key);
    return;
  }
  for (const write of writes) {
    if (write.status === "rejected") throw write.reason;
  }

  console.log("image-processor wrote derivatives", {
    bucket,
    key,
    thumb: derived.thumb,
    large: derived.large,
    originalBytes: original.byteLength,
    thumbBytes: thumbWebp.byteLength,
    largeBytes: largeJpeg.byteLength,
  });
};

const processMessage = async (message: SQSRecord): Promise<void> => {
  const notification = parseS3Event(message.body);
  if (!notification) {
    console.log("image-processor ignored message", {
      messageId: message.messageId,
    });
    return;
  }

  for (const record of notification.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeS3Key(record.s3.object.key);

    const created = record.eventName.startsWith("ObjectCreated:");
    const removed = record.eventName.startsWith("ObjectRemoved:");
    if ((!created && !removed) || !key.startsWith(PHOTO_KEY_PREFIX)) {
      console.log("image-processor ignored object", {
        bucket,
        key,
        eventName: record.eventName,
      });
      continue;
    }

    if (removed) {
      // Events are unordered: a stale removal must not erase a re-upload.
      if (!(await originalExists(bucket, key)))
        await removeDerivatives(bucket, key);
    } else {
      await processOriginal(bucket, key);
    }
  }
};

/**
 * SQS consumer for S3 ObjectCreated and ObjectRemoved notifications on the photos bucket.
 * Reads each original, writes thumb.webp + large.jpg under derived/.
 */
export const handler: SQSHandler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

  for (const message of event.Records) {
    try {
      await processMessage(message);
    } catch (error: unknown) {
      console.error("image-processor failed message", {
        messageId: message.messageId,
        error: error instanceof Error ? error.message : error,
      });
      batchItemFailures.push({ itemIdentifier: message.messageId });
    }
  }

  return { batchItemFailures };
};
