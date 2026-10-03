import { createApiError } from "@/lib/api/errors";

/** What a mint endpoint is told about the file: the exact type and length the URL gets signed for. */
export type UploadFileDeclaration<TContentType extends string = string> = {
  contentType: TContentType;
  sizeBytes: number;
};

/** The part of every mint response the upload needs (`api/docs/uploads.md`). */
export type UploadSlot = {
  uploadUrl: string;
  /** When `uploadUrl` stops being accepted. */
  expiresAt?: string;
};

type UploadFileOptions<TContentType extends string, TSlot extends UploadSlot> = {
  uri: string;
  contentType: TContentType;
  /** Asks the API for an upload URL signed for this declaration. */
  mint: (file: UploadFileDeclaration<TContentType>) => Promise<TSlot>;
};

/**
 * The bytes the upload will send. The upload URL is signed for an exact
 * Content-Length, so the declared size must be that of these bytes. The
 * picker's fileSize can describe the original photo rather than the cropped,
 * re-encoded file, which S3 rejects with 403.
 */
export const readFileBlob = async (uri: string): Promise<Blob> => {
  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();
  if (blob.size <= 0) {
    throw new Error("Could not determine file size for upload");
  }
  return blob;
};

/** Step 2 of the shared upload protocol: PUT the bytes to the slot's presigned URL. */
export const putFile = async (blob: Blob, contentType: string, slot: UploadSlot): Promise<void> => {
  if (slot.expiresAt && Date.parse(slot.expiresAt) <= Date.now()) {
    throw createApiError("The upload link expired before the upload started. Please try again.");
  }

  // Expo's fetch sends a Blob body with the blob's own type as Content-Type,
  // overriding the header below. A blob read from a file:// URI has an empty
  // type, so S3 sees "content-type:" and rejects the signed URL with 403.
  // slice() gives a typed view of the same bytes without copying them.
  const typedBlob = blob.slice(0, blob.size, contentType);

  const uploadResponse = await fetch(slot.uploadUrl, {
    body: typedBlob,
    headers: { "Content-Type": contentType },
    method: "PUT",
  });

  if (!uploadResponse.ok) {
    throw createApiError(`Upload to storage failed (${uploadResponse.status})`, { status: uploadResponse.status });
  }
};

/**
 * Steps 1 and 2 of the shared upload protocol for avatars and covers: read the
 * local file, mint a URL for its real type and size, and PUT the bytes to
 * storage. Returns the minted slot so the caller can confirm with its id.
 * Event photos mint in batches instead (`features/events/api/upload-event-photos.ts`).
 */
export const uploadFile = async <TContentType extends string, TSlot extends UploadSlot>({
  uri,
  contentType,
  mint,
}: UploadFileOptions<TContentType, TSlot>): Promise<TSlot> => {
  const blob = await readFileBlob(uri);
  const slot = await mint({ contentType, sizeBytes: blob.size });
  await putFile(blob, contentType, slot);
  return slot;
};
