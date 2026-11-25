import { onlineManager } from "@tanstack/react-query";
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
   * few seconds after upload), so a failed load is tried three more times
   * before giving up. Without it, it is tried once more: one failure can be
   * an expired link or a dropped request as easily as a missing image.
   * Defaults to true.
   */
  mayBeLate?: boolean;
};

type RetryingPhotoProps = Omit<ComponentProps<typeof Photo>, "source" | "onError"> & PhotoPreview;

// New uploads can be listed before their derivative is written. Keep retries bounded.
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

/** Stored for an image that won't be asked for again this session. */
const GAVE_UP = RETRY_DELAYS_MS.length + 1;

/** Tries after the first for an image that can't be late. */
const SETTLED_RETRIES = 1;

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

type FallbackPhotoProps = Omit<RetryingPhotoProps, "uri" | "cacheKey" | "fallback" | "mayBeLate"> & {
  fallback: PhotoVariant;
};

/**
 * The fallback: the full photo, standing in for a thumbnail.
 *
 * - Low priority, so thumbnails that exist load first.
 * - Decoded at the frame's size, not the photo's (`enforceEarlyResizing` on
 *   iOS; Android downscales by default).
 * - Its failures are counted apart from the photo's own: giving up here must
 *   not blank the same photo where it is asked for on purpose, such as the
 *   viewer or a report, which load it under the same cache key.
 */
const FallbackPhoto = ({ fallback, ...props }: FallbackPhotoProps) => {
  const retryKey = `${fallback.cacheKey ?? fallback.uri}:fallback`;
  return (
    <RemotePhoto
      {...props}
      key={retryKey}
      retryKey={retryKey}
      uri={fallback.uri}
      cacheKey={fallback.cacheKey}
      mayBeLate
      priority="low"
      enforceEarlyResizing
    />
  );
};

const RemotePhoto = ({ uri, cacheKey, retryKey, mayBeLate, fallback, ...props }: RemotePhotoProps) => {
  const [failures, setFailures] = useState(() => failedLoads.get(retryKey) ?? 0);
  const [waiting, setWaiting] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), RETRY_DELAYS_MS[failures - 1]);
    return () => clearTimeout(timer);
  }, [waiting, failures]);

  // Asked for again once the phone has a network.
  useEffect(() => {
    if (!offline) return;
    const retry = () => {
      if (onlineManager.isOnline()) setOffline(false);
    };
    retry();
    return onlineManager.subscribe(retry);
  }, [offline]);

  const onError = () => {
    // Without a network a failed load says nothing about the image: it isn't
    // counted, so the frame neither gives up for the session nor goes on to
    // download the full photo once the network is back.
    if (!onlineManager.isOnline()) {
      setOffline(true);
      return;
    }
    // An image that can't be late isn't coming by waiting long for it, but
    // it gets one more try: by then a re-signed link or the network is back.
    const retries = mayBeLate ? RETRY_DELAYS_MS.length : SETTLED_RETRIES;
    const next = failures + 1 > retries ? GAVE_UP : failures + 1;
    failedLoads.set(retryKey, next);
    setFailures(next);
    setWaiting(next !== GAVE_UP);
  };

  if (failures >= GAVE_UP) return fallback ? <FallbackPhoto {...props} fallback={fallback} /> : null;
  if (waiting || offline) return null;
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
  return fallback ? <FallbackPhoto {...props} fallback={fallback} /> : null;
};
