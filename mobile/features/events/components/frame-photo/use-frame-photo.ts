import { useEffect, useRef, useState } from "react";
import type { PhotoResponseDto } from "../../types";

type Sources = { photoId: string; attempt: number; original: string; thumbnail?: string };

/**
 * Loading state for one frame's original. Every mounted page tracks whether
 * its original has displayed, so a preloaded neighbour is already sharp when
 * it becomes current; only the current frame shows loading, times out, or
 * renews its URL.
 */
export const useFramePhoto = ({
  photo,
  active,
  onRetry,
}: {
  photo: PhotoResponseDto;
  active: boolean;
  onRetry: () => Promise<void>;
}) => {
  const photoId = photo.id;
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // An inactive page's failure waits until it is current, then renews like any other.
  const [failedWhileInactive, setFailedWhileInactive] = useState(false);
  // Gallery refetches re-sign every URL, including when the app returns from
  // the Photos permission prompt during a save. The image behind a cache key
  // does not change, so keep the URL this attempt started with; only a renewal
  // (a new attempt) picks up a new one. Re-signing used to reload the open
  // original in place while it reported "loaded".
  const [sources, setSources] = useState<Sources>({
    photoId,
    attempt,
    original: photo.url,
    thumbnail: photo.thumbnailUrl,
  });
  if (sources.photoId !== photoId || sources.attempt !== attempt) {
    setSources({ photoId, attempt, original: photo.url, thumbnail: photo.thumbnailUrl });
  }
  const renewalAttempted = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Each visit to a frame gets one automatic renewal.
  useEffect(() => {
    if (active) renewalAttempted.current = false;
  }, [active]);

  const showFailure = (reason: "image_error" | "refresh_error") => {
    setStatus("failed");
    // Native image errors may contain signed URLs. Log identifiers and a safe reason only.
    if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: photoId, reason });
  };

  useEffect(() => {
    if (!active || status !== "loading" || refreshing) return;
    const timer = setTimeout(() => {
      setStatus("failed");
      if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: photoId, reason: "timeout" });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [active, status, attempt, photoId, refreshing]);

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
    if (!active) {
      setFailedWhileInactive(true);
      return;
    }
    // A cached gallery may outlive its signed URLs. Renew only once per
    // visit, then leave persistent failures to the explicit retry.
    if (!renewalAttempted.current) {
      setStatus("loading");
      void retry();
    } else {
      showFailure("image_error");
    }
  };

  if (active && failedWhileInactive) {
    setFailedWhileInactive(false);
    setStatus("loading");
    setAttempt((current) => current + 1);
  }

  return {
    status,
    attempt,
    refreshing,
    retry,
    fail,
    originalUri: sources.original,
    thumbnailUri: sources.thumbnail,
    onDisplay: () => {
      setFailedWhileInactive(false);
      setStatus("loaded");
    },
  };
};
