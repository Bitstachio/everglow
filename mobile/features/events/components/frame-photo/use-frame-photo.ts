import { useEffect, useState } from "react";

export const useFramePhoto = (photoId: string, onRetry: () => Promise<void>) => {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fail = (reason: "image_error" | "timeout") => {
    setStatus("failed");
    // Native image errors may contain signed URLs. Log identifiers and a safe reason only.
    if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: photoId, reason });
  };

  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => {
      setStatus("failed");
      if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: photoId, reason: "timeout" });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [status, attempt, photoId]);

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

  return { status, attempt, refreshing, retry, fail, onDisplay: () => setStatus("loaded") };
};
