import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, InternalServerErrorException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { DEFAULT_PRESIGNED_URL_TTL_SECONDS, MAX_DELETE_OBJECTS_BATCH_SIZE, S3_SERVICE_ERRORS } from "./s3.constants";

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}

export interface PresignedUploadInput {
  key: string;
  contentType?: string;
  /** Exact body size the URL accepts; any other Content-Length is rejected by S3. */
  contentLength?: number;
  expiresInSeconds?: number;
}

export interface PresignedDownloadInput {
  key: string;
  expiresInSeconds?: number;
}

export type HeadObjectResult = { exists: true; contentType?: string; sizeBytes?: number } | { exists: false };

export interface S3ObjectSummary {
  key: string;
  sizeBytes?: number;
  lastModified?: Date;
}

export interface ListObjectsResult {
  objects: S3ObjectSummary[];
  /** Present when the listing is truncated; pass it back to fetch the next page. */
  nextContinuationToken?: string;
}

export interface DeleteObjectsResult {
  /** Keys S3 reported as deleted (a key that did not exist counts as deleted). */
  deleted: string[];
  /** Keys S3 refused to delete, with the error it gave for each. */
  failed: { key: string; code?: string; message?: string }[];
}

// Request headers a presigned PUT binds the client to. The S3 presigner marks
// content-type unsignable by default, so a URL minted for image/jpeg would
// accept a body of any type; naming it here puts it in X-Amz-SignedHeaders and
// S3 then rejects a PUT whose Content-Type differs from what was signed.
// content-length is signed as soon as ContentLength is set on the command and
// is listed for the same clarity.
const PRESIGNED_UPLOAD_SIGNED_HEADERS = new Set(["content-type", "content-length"]);

@Injectable()
export class S3Service implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);

    const region = configService.getOrThrow<string>("aws.region");
    const bucket = configService.get<string>("aws.s3Bucket");
    if (!bucket) throw new Error(S3_SERVICE_ERRORS.BUCKET_NOT_CONFIGURED());
    this.bucket = bucket;

    const accessKeyId = configService.get<string>("aws.accessKeyId");
    const secretAccessKey = configService.get<string>("aws.secretAccessKey");
    if (!accessKeyId || !secretAccessKey) throw new Error(S3_SERVICE_ERRORS.CREDENTIALS_NOT_CONFIGURED());

    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  getBucket(): string {
    return this.bucket;
  }

  async putObject({ key, body, contentType }: PutObjectInput): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 putObject failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.PUT_FAILED(key));
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 deleteObject failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.DELETE_FAILED(key));
    }
  }

  /**
   * Deletes many keys with as few requests as S3 allows (1000 per call).
   * S3 reports per-key failures inside a successful response, so those come
   * back in `failed` rather than as a throw; only a request that fails as a
   * whole throws, in which case none of that request's keys were attempted.
   */
  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    const result: DeleteObjectsResult = { deleted: [], failed: [] };

    for (let start = 0; start < keys.length; start += MAX_DELETE_OBJECTS_BATCH_SIZE) {
      const batch = keys.slice(start, start + MAX_DELETE_OBJECTS_BATCH_SIZE);
      try {
        const response = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            // Quiet: the response lists only the keys that failed.
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        const errors = (response.Errors ?? []).flatMap((error) =>
          error.Key ? [{ key: error.Key, code: error.Code, message: error.Message }] : [],
        );
        const failedKeys = new Set(errors.map((error) => error.key));
        result.failed.push(...errors);
        result.deleted.push(...batch.filter((key) => !failedKeys.has(key)));
      } catch (error) {
        this.logger.error({ err: error as Error, count: batch.length }, "s3 deleteObjects failed");
        throw new InternalServerErrorException(S3_SERVICE_ERRORS.DELETE_BATCH_FAILED(batch.length));
      }
    }

    return result;
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { exists: true, contentType: response.ContentType, sizeBytes: response.ContentLength };
    } catch (error) {
      if (error instanceof NotFound) return { exists: false };
      this.logger.error({ err: error as Error, key }, "s3 headObject failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.HEAD_FAILED(key));
    }
  }

  /**
   * One page (up to 1000 keys, in key order) of the objects under `prefix`.
   * Callers paginate with the returned continuation token.
   */
  async listObjects(prefix: string, continuationToken?: string): Promise<ListObjectsResult> {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }),
      );
      const objects = (response.Contents ?? []).flatMap((object): S3ObjectSummary[] =>
        object.Key ? [{ key: object.Key, sizeBytes: object.Size, lastModified: object.LastModified }] : [],
      );
      return { objects, nextContinuationToken: response.IsTruncated ? response.NextContinuationToken : undefined };
    } catch (error) {
      this.logger.error({ err: error as Error, prefix }, "s3 listObjects failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.LIST_FAILED(prefix));
    }
  }

  /**
   * A PUT URL tied to one key, and to the declared content type and length
   * when given: S3 refuses a body whose Content-Type or Content-Length differs
   * from what was signed, so the caller's validation of those values holds all
   * the way to the bucket.
   */
  async getPresignedUploadUrl({
    key,
    contentType,
    contentLength,
    expiresInSeconds = DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  }: PresignedUploadInput): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
        { expiresIn: expiresInSeconds, signableHeaders: PRESIGNED_UPLOAD_SIGNED_HEADERS },
      );
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 getPresignedUploadUrl failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.PRESIGN_FAILED(key));
    }
  }

  async getPresignedDownloadUrl({
    key,
    expiresInSeconds = DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  }: PresignedDownloadInput): Promise<string> {
    try {
      return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 getPresignedDownloadUrl failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.PRESIGN_FAILED(key));
    }
  }
}
