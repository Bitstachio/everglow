import { useCallback, useEffect, useRef, useState } from "react";

/** How long an original may go without a byte arriving before the viewer offers Try again. */
export const STALL_MS = 30_000;

type FramePhotoStatus = "loading" | "loaded" | "failed";

/**
 * Loads one original and keeps it recoverable. A slow download carries on as
 * long as bytes keep arriving; only one that stalls for `STALL_MS` gives up,
 * since giving up unmounts the image and cancels what has arrived so far.
 */
export const useFramePhoto = (photoId: string, onRetry: () => Promise<void>) => {
  const [status, setStatus] = useState<FramePhotoStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = useCallback(
    (reason: "image_error" | "timeout") => {
      setStatus("failed");
      // Native image errors may contain signed URLs. Log identifiers and a safe reason only.
      if (__DEV__) console.warn("photo.viewer.load_failed", { photoId, reason });
    },
    [photoId],
  );

  const stopStallTimer = useCallback(() => {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    stallTimer.current = null;
  }, []);

  const startStallTimer = useCallback(() => {
    stopStallTimer();
    stallTimer.current = setTimeout(() => fail("timeout"), STALL_MS);
  }, [fail, stopStallTimer]);

  useEffect(() => {
    if (status !== "loading") return;
    startStallTimer();
    return stopStallTimer;
  }, [status, attempt, startStallTimer, stopStallTimer]);

  const retry = async () => {
    setRefreshing(true);
    try {
      // Renew the signature as well as remounting the image; the old URL may have expired.
      await onRetry();
      setAttempt((current) => current + 1);
      setStatus("loading");
    } catch {
      setStatus("failed");
    } finally {
      setRefreshing(false);
    }
  };

  return {
    status,
    attempt,
    refreshing,
    retry,
    // Each chunk that arrives restarts the stall timer.
    onProgress: () => {
      if (status === "loading") startStallTimer();
    },
    onDisplay: () => setStatus("loaded"),
    onError: () => fail("image_error"),
  };
};
