import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PhotoResponseDto } from "../../types";

/** How long an original may go without a byte arriving before the viewer offers Try again. */
export const STALL_MS = 30_000;

type FramePhotoStatus = "loading" | "loaded" | "failed";

type FailReason = "image_error" | "timeout" | "refresh_error";

type Links = Pick<PhotoResponseDto, "url" | "thumbnailUrl">;

/** Renews the current frame's links; resolves with them when it can. */
export type RenewFrame = () => Promise<Links | void>;

type Sources = { photoId: string; attempt: number; original: string; thumbnail?: string };

/**
 * Loads one frame's original and keeps it recoverable. Every page the pager
 * mounts tracks whether its original has displayed, so a preloaded neighbour
 * is already sharp when it becomes current. Only the current frame shows
 * loading, stalls, renews its link or offers Try again.
 *
 * A slow download carries on as long as bytes keep arriving; only one that
 * stalls for `STALL_MS` gives up, since giving up unmounts the image and
 * cancels what has arrived so far.
 *
 * A cached contact sheet can outlive its signed links, so the current frame's
 * first image error on each visit renews the link once by itself, with the
 * spinner still up. A second error, a failed renewal or a stall offers Try
 * again. A neighbour that fails waits until it is current, then does the same.
 */
export const useFramePhoto = ({
  photo,
  active,
  onRetry,
}: {
  photo: PhotoResponseDto;
  /** The frame on screen, rather than a neighbour kept ready. */
  active: boolean;
  onRetry: RenewFrame;
}) => {
  const photoId = photo.id;
  const [status, setStatus] = useState<FramePhotoStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Gallery refetches re-sign every URL, including when the app returns from
  // the Photos permission prompt during a save. The image behind a cache key
  // does not change, so keep the URL this attempt started with; only a new
  // attempt picks up a new one. Re-signing used to reload the open original
  // in place while it reported "loaded". A renewal hands over its links
  // directly: the contact sheet it also updates may reach this page a render
  // later.
  const [renewedLinks, setRenewedLinks] = useState<Links | null>(null);
  const [sources, setSources] = useState<Sources>({
    photoId,
    attempt,
    original: photo.url,
    thumbnail: photo.thumbnailUrl,
  });
  if (sources.photoId !== photoId || sources.attempt !== attempt) {
    const links = renewedLinks ?? photo;
    setSources({ photoId, attempt, original: links.url, thumbnail: links.thumbnailUrl });
  }
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renewed = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  // A neighbour's failure waits until it is current, then renews like any
  // other: renewal always targets the open frame.
  const failedWhileInactive = useRef(false);
  const renewOrFailLatest = useRef<() => void>(() => {});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Each visit to a frame gets one automatic renewal.
  useEffect(() => {
    if (!active) return;
    renewed.current = false;
    if (failedWhileInactive.current) {
      failedWhileInactive.current = false;
      renewOrFailLatest.current();
    }
  }, [active]);

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

  // A neighbour downloads without a deadline; the timer starts when it becomes current.
  useEffect(() => {
    if (!active || status !== "loading" || refreshing) return;
    startStallTimer();
    return stopStallTimer;
  }, [active, status, attempt, refreshing, startStallTimer, stopStallTimer]);

  const retry = async () => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    renewed.current = true;
    setRefreshing(true);
    try {
      // Renew the signature as well as remounting the image; the old URL may have expired.
      const links = await onRetry();
      if (!mounted.current) return;
      setRenewedLinks(links || null);
      setAttempt((current) => current + 1);
      setStatus("loading");
    } catch {
      if (mounted.current) fail("refresh_error");
    } finally {
      pending.current = false;
      if (mounted.current) setRefreshing(false);
    }
  };

  const renewOrFail = () => {
    if (renewed.current) {
      fail("image_error");
      return;
    }
    setStatus("loading");
    void retry();
  };
  useLayoutEffect(() => {
    renewOrFailLatest.current = renewOrFail;
  });

  const onError = () => {
    if (pending.current || !mounted.current) return;
    if (!active) {
      failedWhileInactive.current = true;
      return;
    }
    renewOrFail();
  };

  return {
    status,
    attempt,
    refreshing,
    retry,
    originalUri: sources.original,
    thumbnailUri: sources.thumbnail,
    // Each chunk that arrives restarts the current frame's stall timer.
    onProgress: () => {
      if (active && status === "loading" && !refreshing) startStallTimer();
    },
    onDisplay: () => {
      failedWhileInactive.current = false;
      setStatus("loaded");
    },
    onError,
  };
};
