import { useEffect, useState, type ComponentProps } from "react";
import { Photo } from "./photo";

type RetryingPhotoProps = Omit<ComponentProps<typeof Photo>, "source" | "onError"> & {
  uri?: string;
  cacheKey?: string;
};

// New uploads can be listed before their derivative is written. Keep retries bounded.
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

/**
 * Failed loads per image, for the session. Keyed by the image's stable cache
 * key rather than its URL: the API signs URLs anew on every fetch, and a new
 * signature must not start the attempts over. An image that used them all up
 * isn't asked for again, even when its frame remounts.
 */
const failedLoads = new Map<string, number>();

const RemotePhoto = ({ uri, cacheKey, retryKey, ...props }: RetryingPhotoProps & { uri: string; retryKey: string }) => {
  const [failures, setFailures] = useState(() => failedLoads.get(retryKey) ?? 0);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), RETRY_DELAYS_MS[failures - 1]);
    return () => clearTimeout(timer);
  }, [waiting, failures]);

  const onError = () => {
    const next = failures + 1;
    failedLoads.set(retryKey, next);
    setFailures(next);
    setWaiting(next <= RETRY_DELAYS_MS.length);
  };

  if (waiting || failures > RETRY_DELAYS_MS.length) return null;
  return <Photo {...props} key={failures} source={{ uri, cacheKey }} recyclingKey={retryKey} onError={onError} />;
};

/** Retry this exact image only; leave the parent's placeholder visible after failure. */
export const RetryingPhoto = ({ uri, cacheKey, ...props }: RetryingPhotoProps) =>
  uri ? (
    <RemotePhoto key={cacheKey ?? uri} retryKey={cacheKey ?? uri} uri={uri} cacheKey={cacheKey} {...props} />
  ) : null;
