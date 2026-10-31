import { useEffect, useRef, useState } from "react";

export const useFramePhoto = (photoId: string, onRetry: () => Promise<void>) => {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const renewalAttempted = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const showFailure = (reason: "image_error" | "refresh_error") => {
    setStatus("failed");
    // Native image errors may contain signed URLs. Log identifiers and a safe reason only.
    if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: photoId, reason });
  };

  useEffect(() => {
    if (status !== "loading" || refreshing) return;
    const timer = setTimeout(() => {
      setStatus("failed");
      if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: photoId, reason: "timeout" });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [status, attempt, photoId, refreshing]);

  const retry = async () => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    renewalAttempted.current = true;
    setRefreshing(true);
    try {
      // Renew the signature as well as remounting the image; the old URL may have expired.
      await onRetry();
      if (!mounted.current) return;
      setAttempt((current) => current + 1);
      setStatus("loading");
    } catch {
      if (mounted.current) showFailure("refresh_error");
    } finally {
      pending.current = false;
      if (mounted.current) setRefreshing(false);
    }
  };

  const fail = () => {
    if (pending.current || !mounted.current) return;
    // A cached gallery may outlive its signed URLs. Renew only once per
    // opened photo, then leave persistent failures to the explicit retry.
    if (!renewalAttempted.current) {
      setStatus("loading");
      void retry();
    } else {
      showFailure("image_error");
    }
  };

  return { status, attempt, refreshing, retry, fail, onDisplay: () => setStatus("loaded") };
};
