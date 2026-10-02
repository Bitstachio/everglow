import { createApiError, getErrorCode, isApiError } from "@/lib/api/errors";
import type { CreateImageUploadDto, ImageUploadResponseDto } from "@/lib/api/generated";
import { uploadFile, type UploadFileDeclaration } from "@/lib/api/upload-file";

/** The API's limit for avatars and covers (`docs/image-uploads.md`). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** The object never arrived or was the wrong type or size; the upload is spent and a new URL is needed. */
const START_OVER_CODES = new Set(["IMAGE_UPLOAD_EXPIRED", "IMAGE_UPLOAD_REJECTED"]);
const MAX_UPLOAD_ATTEMPTS = 2;

export const isConflict = (error: unknown) => isApiError(error) && error.status === 409;

/**
 * Avatar and cover writes are conditional on the image the server last read,
 * so a change from elsewhere in between is a 409. The server reads again on
 * every request, so one retry applies this change on top of the other one.
 */
export const retryOnceOnConflict = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request();
  } catch (error) {
    if (!isConflict(error)) throw error;
    return request();
  }
};

type ImageDeclaration = UploadFileDeclaration<CreateImageUploadDto["contentType"]>;

type UploadImageOptions<TResult> = {
  uri: string;
  contentType: CreateImageUploadDto["contentType"];
  /** Shown when the prepared file is still over IMAGE_MAX_BYTES. */
  tooLargeMessage: string;
  mint: (file: ImageDeclaration) => Promise<ImageUploadResponseDto>;
  confirm: (uploadId: string) => Promise<TResult>;
};

/**
 * The whole single-image upload (`docs/uploads.md`): mint, PUT, confirm. Starts
 * over once with a new URL when the confirm says the upload is spent, and
 * retries a confirm that lost a race once.
 */
export const uploadImage = async <TResult>({
  uri,
  contentType,
  tooLargeMessage,
  mint,
  confirm,
}: UploadImageOptions<TResult>): Promise<TResult> => {
  const checkedMint = (file: ImageDeclaration) => {
    if (file.sizeBytes > IMAGE_MAX_BYTES) {
      throw createApiError(tooLargeMessage, { code: "IMAGE_INVALID_SIZE" });
    }
    return mint(file);
  };

  for (let attempt = 1; ; attempt += 1) {
    try {
      const { uploadId } = await uploadFile({ uri, contentType, mint: checkedMint });
      return await retryOnceOnConflict(() => confirm(uploadId));
    } catch (error) {
      const code = getErrorCode(error);
      if (attempt >= MAX_UPLOAD_ATTEMPTS || !code || !START_OVER_CODES.has(code)) throw error;
    }
  }
};
