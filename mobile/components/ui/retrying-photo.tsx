import { useEffect, useState, type ComponentProps } from "react";
import { Photo } from "./photo";

type RetryingPhotoProps = Omit<ComponentProps<typeof Photo>, "source" | "onError"> & {
  uri?: string;
  cacheKey?: string;
};

// New uploads can be listed before their derivative is written. Keep retries bounded.
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

const RemotePhoto = ({ uri, cacheKey, ...props }: RetryingPhotoProps & { uri: string }) => {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const delay = RETRY_DELAYS_MS[attempt];
    if (!failed || delay === undefined) return;
    const timer = setTimeout(() => {
      setAttempt((current) => current + 1);
      setFailed(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [attempt, failed]);

  if (failed) return null;
  return (
    <Photo
      {...props}
      key={attempt}
      source={{ uri, cacheKey }}
      recyclingKey={cacheKey ?? uri}
      onError={() => setFailed(true)}
    />
  );
};

/** Retry this exact image only; leave the parent's placeholder visible after failure. */
export const RetryingPhoto = ({ uri, cacheKey, ...props }: RetryingPhotoProps) =>
  uri ? <RemotePhoto key={`${cacheKey ?? ""}:${uri}`} uri={uri} cacheKey={cacheKey} {...props} /> : null;
