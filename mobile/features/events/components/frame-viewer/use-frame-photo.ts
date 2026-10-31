import { useCallback, useEffect, useRef, useState } from "react";

/** How long an original may go without a byte arriving before the viewer offers Try again. */
export const STALL_MS = 30_000;

type FramePhotoStatus = "loading" | "loaded" | "failed";

type FailReason = "image_error" | "timeout" | "refresh_error";

/**
 * Loads one original and keeps it recoverable. A slow download carries on as
 * long as bytes keep arriving; only one that stalls for `STALL_MS` gives up,
 * since giving up unmounts the image and cancels what has arrived so far.
 *
 * A cached contact sheet can outlive its signed links, so the first image
 * error renews the link once by itself, with the spinner still up. A second
 * error, a failed renewal or a stall offers Try again.
 */
export const useFramePhoto = (photoId: string, onRetry: () => Promise<void>) => {
  const [status, setStatus] = useState<FramePhotoStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renewed = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = useCallback(
    (reason: FailReason) => {
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
    if (status !== "loading" || refreshing) return;
    startStallTimer();
    return stopStallTimer;
  }, [status, attempt, refreshing, startStallTimer, stopStallTimer]);

  const retry = async () => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    renewed.current = true;
    setRefreshing(true);
    try {
      // Renew the signature as well as remounting the image; the old URL may have expired.
      await onRetry();
      if (!mounted.current) return;
      setAttempt((current) => current + 1);
      setStatus("loading");
    } catch {
      if (mounted.current) fail("refresh_error");
    } finally {
      pending.current = false;
      if (mounted.current) setRefreshing(false);
    }
  };

  const onError = () => {
    if (pending.current || !mounted.current) return;
    if (renewed.current) {
      fail("image_error");
      return;
    }
    setStatus("loading");
    void retry();
  };

  return {
    status,
    attempt,
    refreshing,
    retry,
    // Each chunk that arrives restarts the stall timer.
    onProgress: () => {
      if (status === "loading" && !refreshing) startStallTimer();
    },
    onDisplay: () => setStatus("loaded"),
    onError,
  };
};
