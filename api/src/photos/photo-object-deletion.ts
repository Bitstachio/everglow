import { InternalServerErrorException } from "@nestjs/common";
import { S3_SERVICE_ERRORS } from "src/sdk/aws/s3/s3.constants";
import { DeleteObjectsResult, S3Service } from "src/sdk/aws/s3/s3.service";
import { withPhotoDerivativeS3Keys } from "./photos.constants";

export interface ObjectsWithDerivativesDeletion {
  /** The given keys S3 deleted. */
  deleted: string[];
  /** The given keys S3 refused to delete. */
  failed: DeleteObjectsResult["failed"];
  /** Derived keys S3 refused to delete; the orphan reconciler and the Lambda's ObjectRemoved path reclaim them. */
  derivativesFailed: string[];
}

/**
 * Deletes objects together with the thumbnail and display copy of each photo
 * original among them, in the same DeleteObjects batch. Call it with keys that
 * have already been through EvidenceService.preserveBeforeDelete: a retained
 * original keeps its derived copies, which go when the evidence job finally
 * deletes it. A derived key that does not exist counts as deleted, so an
 * original the image processor never rendered (HEIC, or not processed yet)
 * costs nothing extra.
 *
 * Results are reported for the given keys only. A derived key that fails does
 * not fail its original: once the original is gone a retry would find nothing
 * to delete, and the backstops reclaim the copy. Throws, like
 * S3Service.deleteObjects, only when a request fails as a whole.
 */
export const deleteObjectsWithDerivatives = async (
  s3Service: S3Service,
  keys: string[],
): Promise<ObjectsWithDerivativesDeletion> => {
  if (keys.length === 0) return { deleted: [], failed: [], derivativesFailed: [] };

  const given = new Set(keys);
  const outcome = await s3Service.deleteObjects(withPhotoDerivativeS3Keys(keys));
  return {
    deleted: outcome.deleted.filter((key) => given.has(key)),
    failed: outcome.failed.filter((failure) => given.has(failure.key)),
    derivativesFailed: outcome.failed.flatMap((failure) => (given.has(failure.key) ? [] : [failure.key])),
  };
};

/**
 * One object and, for a photo original, its derived copies. Throws when the
 * object itself could not be deleted, as S3Service.deleteObject does, so a
 * caller that deletes S3 first keeps its row for a retry.
 */
export const deleteObjectWithDerivatives = async (s3Service: S3Service, key: string): Promise<void> => {
  const { failed } = await deleteObjectsWithDerivatives(s3Service, [key]);
  if (failed.length > 0) throw new InternalServerErrorException(S3_SERVICE_ERRORS.DELETE_FAILED(key));
};
