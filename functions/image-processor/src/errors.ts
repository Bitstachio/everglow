/** A failure whose message this worker wrote itself, so it is safe to log. */
export class PhotoProcessingError extends Error {
  override name = "PhotoProcessingError";
}

export type UndecodableReason = "empty" | "unsupported_format" | "corrupt" | "pixel_limit";

/**
 * The original can never produce derivatives: the same bytes fail the same way
 * on every attempt. The handler acknowledges it instead of retrying.
 */
export class UndecodablePhotoError extends PhotoProcessingError {
  override name = "UndecodablePhotoError";

  constructor(
    readonly reason: UndecodableReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

// Sharp's own input checks, then libvips loader domains (see derivatives.spec.ts).
const REASON_PATTERNS: [RegExp, UndecodableReason][] = [
  [/^Input image exceeds pixel limit/, "pixel_limit"],
  [/^Input (buffer|file) contains unsupported image format/, "unsupported_format"],
  [/Support for this compression format has not been built in/, "unsupported_format"],
  [/^Input (buffer|file) is empty/i, "empty"],
  [/^Input (buffer|file) has corrupt header/, "corrupt"],
  [/^(VipsJpeg|vipspng|spng|webp|heif|VipsForeignLoad\w*|\w+load(_buffer)?): /m, "corrupt"],
];

const MAX_DETAIL_LENGTH = 300;

/**
 * Decoder messages are libvips diagnostics, never image bytes. They repeat
 * lines and carry seek noise, so keep one copy of each useful line, printable
 * ASCII only, and bound the length.
 */
export const sanitizeDecoderMessage = (message: string): string => {
  const lines = new Set(
    message
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("source: bad seek")),
  );
  return [...lines]
    .join(" | ")
    .replace(/[^\x20-\x7e]/g, "?")
    .slice(0, MAX_DETAIL_LENGTH);
};

/**
 * Map a Sharp failure to a permanent decode error. Anything unrecognised
 * returns undefined and stays retryable, so it reaches the DLQ and its alarm.
 */
export const toUndecodable = (error: unknown): UndecodablePhotoError | undefined => {
  if (error instanceof UndecodablePhotoError) return error;
  if (!(error instanceof Error)) return undefined;
  const match = REASON_PATTERNS.find(([pattern]) => pattern.test(error.message));
  if (!match) return undefined;
  return new UndecodablePhotoError(match[1], sanitizeDecoderMessage(error.message), { cause: error });
};
