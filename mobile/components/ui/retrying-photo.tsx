import { useEffect, useState, type ComponentProps } from "react";
import { Photo } from "./photo";

/** One copy of a remote photo. Its URL is presigned, so the cache key names it instead. */
export type PhotoVariant = { uri: string; cacheKey?: string };

/**
 * A preview of a remote photo: the copy to show, and what to show instead when
 * that copy can't be had.
 */
export type PhotoPreview = {
  uri?: string;
  cacheKey?: string;
  /**
   * Shown once `uri` has failed for good, or when there is no `uri`: the
   * photo itself, when its thumbnail was never written.
   */
  fallback?: PhotoVariant;
  /**
   * The image may still be on its way (a new photo's thumbnail is written a
   * few seconds after upload), so a failed load is tried again before giving
   * up. Without it the first failure goes straight to `fallback`. Defaults to true.
   */
  mayBeLate?: boolean;
};

type RetryingPhotoProps = Omit<ComponentProps<typeof Photo>, "source" | "onError"> & PhotoPreview;

// New uploads can be listed before their derivative is written. Keep retries bounded.
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

/** Stored for an image that won't be asked for again this session. */
const GAVE_UP = RETRY_DELAYS_MS.length + 1;

/**
 * Failed loads per image, for the session. Keyed by the image's stable cache
 * key rather than its URL: the API signs URLs anew on every fetch, and a new
 * signature must not start the attempts over. An image that used them all up
 * isn't asked for again, even when its frame remounts.
 */
const failedLoads = new Map<string, number>();

type RemotePhotoProps = Omit<RetryingPhotoProps, "uri" | "mayBeLate"> & {
  uri: string;
  retryKey: string;
  mayBeLate: boolean;
};

const RemotePhoto = ({ uri, cacheKey, retryKey, mayBeLate, fallback, ...props }: RemotePhotoProps) => {
  const [failures, setFailures] = useState(() => failedLoads.get(retryKey) ?? 0);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), RETRY_DELAYS_MS[failures - 1]);
    return () => clearTimeout(timer);
  }, [waiting, failures]);

  const onError = () => {
    // An image that can't be late isn't coming by waiting for it.
    const next = mayBeLate ? failures + 1 : GAVE_UP;
    failedLoads.set(retryKey, next);
    setFailures(next);
    setWaiting(next <= RETRY_DELAYS_MS.length);
  };

  if (failures > RETRY_DELAYS_MS.length) {
    // The fallback is the full photo: let thumbnails that exist load first.
    return fallback ? <RetryingPhoto {...props} {...fallback} priority="low" /> : null;
  }
  if (waiting) return null;
  return <Photo {...props} key={failures} source={{ uri, cacheKey }} recyclingKey={retryKey} onError={onError} />;
};

/**
 * Retry this exact image only, then show its `fallback` if it has one. When
 * both fail, render nothing and leave the parent's placeholder visible.
 */
export const RetryingPhoto = ({ uri, cacheKey, fallback, mayBeLate = true, ...props }: RetryingPhotoProps) => {
  if (uri) {
    return (
      <RemotePhoto
        key={cacheKey ?? uri}
        retryKey={cacheKey ?? uri}
        uri={uri}
        cacheKey={cacheKey}
        mayBeLate={mayBeLate}
        fallback={fallback}
        {...props}
      />
    );
  }
  return fallback ? <RetryingPhoto {...props} {...fallback} priority="low" /> : null;
};
