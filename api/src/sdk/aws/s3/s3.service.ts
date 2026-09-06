import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  NoSuchUpload,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
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

export interface MultipartUploadRef {
  key: string;
  uploadId: string;
}

export interface PresignedUploadPartInput extends MultipartUploadRef {
  /** 1-based, as S3 numbers parts. */
  partNumber: number;
  /** Exact part size the URL accepts; any other Content-Length is rejected by S3. */
  contentLength: number;
  expiresInSeconds?: number;
}

export interface MultipartPartSummary {
  partNumber: number;
  sizeBytes?: number;
  etag?: string;
}

/** `exists: false` when S3 no longer knows the upload id: completed, aborted, or expired by a lifecycle rule. */
export type ListMultipartPartsResult = { exists: true; parts: MultipartPartSummary[] } | { exists: false };

export interface CompleteMultipartPart {
  partNumber: number;
  etag: string;
}

/**
 * `completed: false` carries the S3 error code when the assembly was refused
 * on the request's own terms (unknown upload, a part missing, too small, or
 * out of order). Anything else throws like the rest of this service.
 */
export type CompleteMultipartUploadResult = { completed: true } | { completed: false; code: string };

const MULTIPART_COMPLETE_CLIENT_ERRORS = new Set(["NoSuchUpload", "InvalidPart", "InvalidPartOrder", "EntityTooSmall"]);

// UploadPart has no content type of its own (the object's is fixed when the
// upload is created), so a part URL binds only the part's exact length.
const PRESIGNED_UPLOAD_PART_SIGNED_HEADERS = new Set(["content-length"]);

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

  /** Opens a multipart upload for `key`. The object's content type is fixed here; returns the upload id. */
  async createMultipartUpload({ key, contentType }: { key: string; contentType: string }): Promise<string> {
    try {
      const response = await this.client.send(
        new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      );
      if (!response.UploadId) throw new Error("S3 returned no upload id");
      return response.UploadId;
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 createMultipartUpload failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.MULTIPART_CREATE_FAILED(key));
    }
  }

  /** A PUT URL for one part of an open multipart upload, bound to that part's exact size. */
  async getPresignedUploadPartUrl({
    key,
    uploadId,
    partNumber,
    contentLength,
    expiresInSeconds = DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  }: PresignedUploadPartInput): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          ContentLength: contentLength,
        }),
        { expiresIn: expiresInSeconds, signableHeaders: PRESIGNED_UPLOAD_PART_SIGNED_HEADERS },
      );
    } catch (error) {
      this.logger.error({ err: error as Error, key, partNumber }, "s3 getPresignedUploadPartUrl failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.PRESIGN_FAILED(key));
    }
  }

  /** Every part S3 has received for the upload so far, across all result pages. */
  async listMultipartParts({ key, uploadId }: MultipartUploadRef): Promise<ListMultipartPartsResult> {
    const parts: MultipartPartSummary[] = [];
    let partNumberMarker: string | undefined;

    try {
      do {
        const response = await this.client.send(
          new ListPartsCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumberMarker: partNumberMarker,
          }),
        );
        for (const part of response.Parts ?? []) {
          if (part.PartNumber !== undefined) {
            parts.push({ partNumber: part.PartNumber, sizeBytes: part.Size, etag: part.ETag });
          }
        }
        partNumberMarker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
      } while (partNumberMarker);
      return { exists: true, parts };
    } catch (error) {
      if (error instanceof NoSuchUpload) return { exists: false };
      this.logger.error({ err: error as Error, key }, "s3 listParts failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.MULTIPART_LIST_FAILED(key));
    }
  }

  /** Assembles the object from the given parts, which must be listed in ascending part number. */
  async completeMultipartUpload({
    key,
    uploadId,
    parts,
  }: MultipartUploadRef & { parts: CompleteMultipartPart[] }): Promise<CompleteMultipartUploadResult> {
    try {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts.map(({ partNumber, etag }) => ({ PartNumber: partNumber, ETag: etag })) },
        }),
      );
      return { completed: true };
    } catch (error) {
      if (error instanceof S3ServiceException && MULTIPART_COMPLETE_CLIENT_ERRORS.has(error.name)) {
        return { completed: false, code: error.name };
      }
      this.logger.error({ err: error as Error, key }, "s3 completeMultipartUpload failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.MULTIPART_COMPLETE_FAILED(key));
    }
  }

  /** Discards an open upload and its parts. An upload S3 no longer knows counts as already aborted. */
  async abortMultipartUpload({ key, uploadId }: MultipartUploadRef): Promise<void> {
    try {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
    } catch (error) {
      if (error instanceof NoSuchUpload) return;
      this.logger.error({ err: error as Error, key }, "s3 abortMultipartUpload failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.MULTIPART_ABORT_FAILED(key));
    }
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
