import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { Logger } from "pino";
import { createDerivatives } from "./derivatives.js";
import { PhotoProcessingError, UndecodablePhotoError } from "./errors.js";
import { derivedKeysForOriginal } from "./keys.js";

const bodyToBuffer = async (body: unknown): Promise<Buffer> => {
  if (body === undefined || body === null) {
    throw new PhotoProcessingError("S3 GetObject returned no body");
  }
  // Prefer the SDK v3 stream helper; Buffer/Uint8Array checks can mis-handle stream objects.
  if (typeof body === "object" && body !== null && "transformToByteArray" in body) {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
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
  throw new PhotoProcessingError("Unsupported S3 body type");
};

// ListBucket permission makes a missing original a 404; a 403 is never absence.
const isMissing = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "$metadata" in error &&
  (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404;

/** S3 derivative lifecycle. The SQS handler owns transport parsing and retries. */
export class PhotoDerivativeService {
  constructor(
    private readonly s3: Pick<S3Client, "send">,
    private readonly logger: Logger,
  ) {}

  async removeForMissingOriginal(bucket: string, key: string): Promise<void> {
    // Events are unordered: a stale removal must not erase a re-upload.
    if (!(await this.originalExists(bucket, key))) await this.removeDerivatives(bucket, key);
  }

  private async originalExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  private async removeDerivatives(bucket: string, key: string): Promise<void> {
    const keys = derivedKeysForOriginal(key);
    // Wait for both requests, even if one fails, before returning the SQS result.
    const results = await Promise.allSettled(
      Object.values(keys).map((Key) => this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }))),
    );
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
    this.logger.info({ event: "photo.derivatives.removed", bucket, key, audit: true }, "Photo derivatives removed");
  }

  async processOriginal(bucket: string, key: string): Promise<void> {
    const derived = derivedKeysForOriginal(key);

    let got;
    try {
      got = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      if (!isMissing(error)) throw error;
      // Upload notifications can arrive after a photo, account or gallery purge.
      await this.removeDerivatives(bucket, key);
      return;
    }
    // An empty object stays empty; only a new upload (a new notification) changes it.
    if (got.ContentLength === 0) {
      throw new UndecodablePhotoError("empty", "S3 object is empty (0 bytes)");
    }
    const original = await bodyToBuffer(got.Body);
    if (original.byteLength === 0) {
      // A non-empty object that arrives empty is a transport fault: retry it.
      throw new PhotoProcessingError("S3 GetObject decoded to 0 bytes");
    }
    const { thumbWebp, largeJpeg } = await createDerivatives(original);

    const writes = await Promise.allSettled([
      this.s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: derived.thumb,
          Body: thumbWebp,
          ContentType: "image/webp",
        }),
      ),
      this.s3.send(
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
    if (!(await this.originalExists(bucket, key))) {
      await this.removeDerivatives(bucket, key);
      return;
    }
    for (const write of writes) {
      if (write.status === "rejected") throw write.reason;
    }

    this.logger.info(
      {
        event: "photo.derivatives.generated",
        bucket,
        key,
        thumb: derived.thumb,
        large: derived.large,
        originalBytes: original.byteLength,
        thumbBytes: thumbWebp.byteLength,
        largeBytes: largeJpeg.byteLength,
      },
      "Photo derivatives generated",
    );
  }
}
