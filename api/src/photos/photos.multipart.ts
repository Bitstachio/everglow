export interface MultipartPartPlan {
  /** 1-based, as S3 numbers parts. */
  partNumber: number;
  sizeBytes: number;
}

/**
 * Splits `sizeBytes` into consecutive parts of `partSizeBytes`, the last one
 * taking whatever remains. Both ends of an upload derive the layout from
 * these two numbers alone, which is what lets the API mint a URL bound to
 * each part's exact size and, at completion, check what S3 received against
 * what was planned without taking the client's word for it.
 */
export const planMultipartParts = (sizeBytes: number, partSizeBytes: number): MultipartPartPlan[] => {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new Error(`Invalid multipart upload size: ${sizeBytes}`);
  if (!Number.isInteger(partSizeBytes) || partSizeBytes <= 0) {
    throw new Error(`Invalid multipart part size: ${partSizeBytes}`);
  }

  const parts: MultipartPartPlan[] = [];
  for (let offset = 0, partNumber = 1; offset < sizeBytes; offset += partSizeBytes, partNumber += 1) {
    parts.push({ partNumber, sizeBytes: Math.min(partSizeBytes, sizeBytes - offset) });
  }
  return parts;
};
