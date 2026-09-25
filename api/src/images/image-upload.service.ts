import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { presignedUrlExpiresAt, S3Service } from "src/sdk/aws/s3/s3.service";
import {
  buildImageS3Key,
  IMAGE_DOWNLOAD_URL_TTL_SECONDS,
  IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS,
  IMAGE_UPLOAD_ERROR_CODES,
  IMAGE_UPLOAD_ERRORS,
  IMAGE_UPLOAD_URL_TTL_SECONDS,
  isAllowedImageContentType,
  isAllowedImageSize,
} from "./images.constants";

/** Where an image lives: `{prefix}{ownerId}/{uploadId}`. The owner is whatever entity the feature scopes keys by. */
export interface ImageUploadTarget {
  /** S3 key prefix of the image type, ending with "/" (e.g. `avatars/`). */
  prefix: string;
  /** Id of the entity the image belongs to; always taken from the server side, never from the client. */
  ownerId: string;
}

export interface ImageFile {
  contentType: string;
  sizeBytes: number;
}

export interface ImageUpload {
  uploadId: string;
  uploadUrl: string;
  /** When `uploadUrl` stops being accepted; the client requests a new one after this. */
  expiresAt: Date;
}

/** The column that references the image, as the feature that owns the row sees it. */
export interface ImageSlot {
  /** Key the row references now; null when no image is set. */
  currentKey: string | null;
  /** Writes the new key to the row; null clears it. */
  save(key: string | null): Promise<void>;
}

/**
 * Single-image uploads (avatar, cover) for any entity: presigned PUT, verify,
 * replace, remove, presigned GET. See docs/image-uploads.md.
 *
 * Stateless on purpose. Nothing is stored at mint time: the key is derived
 * from the target and the upload id, so confirm re-derives it on the server
 * and a client can only ever name objects under its own owner id. The row is
 * written by the calling feature through `ImageSlot`; this service knows no
 * table.
 */
@Injectable()
export class ImageUploadService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** Mints a PUT URL bound to the declared type and size, so S3 refuses any other body. */
  async createUpload(target: ImageUploadTarget, file: ImageFile): Promise<ImageUpload> {
    // DTOs validate the same bounds at the HTTP edge; this keeps the policy
    // with the module for callers that do not come through one.
    if (!isAllowedImageContentType(file.contentType)) {
      throw new BadRequestException({
        code: IMAGE_UPLOAD_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE,
        message: IMAGE_UPLOAD_ERRORS.UNSUPPORTED_CONTENT_TYPE(file.contentType),
      });
    }
    if (!isAllowedImageSize(file.sizeBytes)) {
      throw new BadRequestException({
        code: IMAGE_UPLOAD_ERROR_CODES.INVALID_SIZE,
        message: IMAGE_UPLOAD_ERRORS.INVALID_SIZE(file.sizeBytes),
      });
    }

    const uploadId = randomUUID();
    const expiresAt = presignedUrlExpiresAt(IMAGE_UPLOAD_URL_TTL_SECONDS);
    const uploadUrl = await this.s3Service.getPresignedUploadUrl({
      key: buildImageS3Key(target.prefix, target.ownerId, uploadId),
      contentType: file.contentType,
      contentLength: file.sizeBytes,
      expiresInSeconds: IMAGE_UPLOAD_URL_TTL_SECONDS,
    });

    return { uploadId, uploadUrl, expiresAt };
  }

  /**
   * Verifies the uploaded object and makes it the slot's image, returning its
   * key. Idempotent: confirming the upload the slot already references is a
   * no-op, so a retried confirm never deletes the image it just set.
   *
   * Object before row, as in a manual photo delete: the previous object is
   * deleted first and the row written last, so a failure at any point leaves a
   * state the same request repairs when retried. Writing the row first would
   * leave the old object referenced by nothing the moment its delete failed,
   * reachable only by the opt-in reconciler.
   */
  async confirmUpload(target: ImageUploadTarget, uploadId: string, slot: ImageSlot): Promise<string> {
    const key = buildImageS3Key(target.prefix, target.ownerId, uploadId);
    if (key === slot.currentKey) return key;

    await this.verifyUploadedObject(key, uploadId);

    if (slot.currentKey) await this.s3Service.deleteObject(slot.currentKey);
    await slot.save(key);

    return key;
  }

  /** Deletes the slot's object, then clears the row. False when there was nothing to remove. */
  async remove(slot: ImageSlot): Promise<boolean> {
    if (!slot.currentKey) return false;

    // S3 first: if it fails the row survives and the removal can be retried.
    await this.s3Service.deleteObject(slot.currentKey);
    await slot.save(null);

    return true;
  }

  /** A short-lived GET URL, or null for an unset image. Signing is local work, so per-row calls are fine. */
  async getDownloadUrl(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;

    return this.s3Service.getPresignedDownloadUrl({ key, expiresInSeconds: IMAGE_DOWNLOAD_URL_TTL_SECONDS });
  }

  /**
   * The PUT URL already bound the declared type and size; this re-checks what
   * actually landed against the module's own limits, since nothing was stored
   * at mint time to compare with. A verdict other than "fine" is final: the
   * object is discarded and the client starts over with a new upload URL.
   */
  private async verifyUploadedObject(key: string, uploadId: string): Promise<void> {
    const head = await this.s3Service.headObject(key);
    if (!head.exists) {
      throw new NotFoundException({
        code: IMAGE_UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND,
        message: IMAGE_UPLOAD_ERRORS.UPLOAD_NOT_FOUND(uploadId),
      });
    }

    // Past the window the orphan reconciler may be deleting this very object,
    // so it must not become referenced any more.
    const confirmableSince = Date.now() - IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS * 1000;
    if (!head.lastModified || head.lastModified.getTime() < confirmableSince) {
      await this.discardRejectedObject(key, uploadId);
      throw new UnprocessableEntityException({
        code: IMAGE_UPLOAD_ERROR_CODES.UPLOAD_EXPIRED,
        message: IMAGE_UPLOAD_ERRORS.UPLOAD_EXPIRED(uploadId),
      });
    }

    if (!isAllowedImageContentType(head.contentType) || !isAllowedImageSize(head.sizeBytes)) {
      await this.discardRejectedObject(key, uploadId);
      throw new UnprocessableEntityException({
        code: IMAGE_UPLOAD_ERROR_CODES.UPLOAD_REJECTED,
        message: IMAGE_UPLOAD_ERRORS.UPLOAD_REJECTED(uploadId),
      });
    }
  }

  // The rejection is what the client needs to hear; an object that cannot be
  // deleted right now is an orphan for the reconciler.
  private async discardRejectedObject(key: string, uploadId: string): Promise<void> {
    try {
      await this.s3Service.deleteObject(key);
    } catch {
      this.logger.warn(
        { event: "image.upload_rejected.object_retained", uploadId },
        "Rejected image upload could not be deleted from S3; the orphan reconciler will reclaim it",
      );
    }
  }
}
