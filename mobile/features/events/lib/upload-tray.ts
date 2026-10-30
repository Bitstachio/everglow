import { onAccountCleared } from "@/lib/account-cleared";
import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";
import { persistUploadTrays, restoreUploadTrays, removeUploadStorage, releaseUploadFile } from "./upload-tray-storage";
import type { PhotoResponseDto } from "../types";
import {
  uploadEventPhotos,
  type EventPhotoFailure,
  type EventPhotoFile,
  type EventPhotoUpdate,
} from "../api/upload-event-photos";

/**
 * The tray (08.2–08.8): the photos someone picked for a roll, from the moment
 * they're chosen until they're on the sheet. It lives outside any screen, so
 * leaving the roll doesn't stop an upload, and the tray screen and the sheet
 * read the same state.
 */

/**
 * - waiting: not sent yet
 * - sending: bytes on their way
 * - developed: confirmed and on the roll
 * - failed: sent but didn't make it, and why
 * - rejected: never sent: a video, or over 25 MB (08.5)
 */
export type TrayStatus =
  | { kind: "waiting" }
  | { kind: "sending"; bytesSent: number }
  | { kind: "developed"; photoId: string }
  | { kind: "failed"; reason: Exclude<EventPhotoFailure, "cancelled"> }
  | { kind: "rejected"; reason: "video" | "tooLarge" };

export type TrayItem = EventPhotoFile & {
  key: string;
  /** The file's name in the library, for example "IMG_2231". */
  name: string;
  status: TrayStatus;
  /** Once its upload URL is minted: its photo id, and which mint it came from (later mints are newer). */
  minted?: { photoId: string; seq: number };
};

export type Tray = {
  items: TrayItem[];
  running: boolean;
  /** Pause if durable state cannot be written; never send unrecorded jobs. */
  storageError?: boolean;
  /** The gallery refused a batch for being closed (08.8): when, and how many had landed by then. */
  closed: { at: string; landed: number } | null;
};

const EMPTY_TRAY: Tray = { items: [], running: false, closed: null };

const trays = new Map<string, Tray>();
let activeUserId: string | null = null;
const controllers = new Map<string, AbortController>();
// Separate from Cancel the rest: sign-out also aborts API requests and confirmation.
const requestControllers = new Map<string, AbortController>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const retryAttempts = new Map<string, number>();
let connected = true;
const clearRetry = (eventId: string) => {
  clearTimeout(retryTimers.get(eventId));
  retryTimers.delete(eventId);
};
/** Refreshes the roll once a run ends: its photos and storage changed. */
const settlers = new Map<string, () => Promise<unknown>>();
const listeners = new Set<() => void>();
/** The local file of each photo this phone added, so its frame never blanks while the roll's copy loads. */
const localFiles = new Map<string, string>();

export const ownsUploadTrays = (userId: string) => activeUserId === userId;

export const localFileFor = (photoId: string): string | undefined => localFiles.get(photoId);

/** Counts mints across every roll, so a later batch always sorts as newer. */
let mintSeq = 0;

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getTray = (eventId: string): Tray => trays.get(eventId) ?? EMPTY_TRAY;

const setTray = (eventId: string, update: (tray: Tray) => Tray, durable = true) => {
  let next = update(getTray(eventId));
  if (durable) delete next.storageError;
  try {
    if (durable && activeUserId) {
      const snapshot = new Map(trays);
      snapshot.set(eventId, next);
      persistUploadTrays(activeUserId, snapshot);
    }
  } catch {
    controllers.get(eventId)?.abort();
    requestControllers.get(eventId)?.abort();
    next = {
      ...next,
      storageError: true,
      items: next.items.map((item) =>
        item.status.kind === "waiting" || item.status.kind === "sending"
          ? { ...item, status: { kind: "failed", reason: "refused" } }
          : item,
      ),
    };
  }
  if (next.items.length === 0 && !next.running && next.closed === null && !next.storageError) trays.delete(eventId);
  else trays.set(eventId, next);
  emit();
};

const mapItems = (eventId: string, map: (item: TrayItem) => TrayItem | null, durable = true) =>
  setTray(
    eventId,
    (tray) => ({
      ...tray,
      items: tray.items.map(map).filter((item): item is TrayItem => item !== null),
    }),
    durable,
  );

const applyUpdate = (eventId: string, key: string, update: EventPhotoUpdate) => {
  if (getTray(eventId).storageError) return;
  const previous = getTray(eventId).items.find((item) => item.key === key);
  // Native byte callbacks update the UI without serializing the entire queue.
  const durable = update.kind !== "sending" || previous?.status.kind !== "sending";
  if (update.kind === "failed" && update.reason === "closed") {
    setTray(eventId, (tray) => ({
      ...tray,
      closed: tray.closed ?? {
        at: new Date().toISOString(),
        landed: tray.items.filter((item) => item.status.kind === "developed").length,
      },
    }));
  }
  mapItems(
    eventId,
    (item) => {
      if (item.key !== key) return item;
      if (update.kind === "sending") return { ...item, status: { kind: "sending", bytesSent: update.bytesSent } };
      if (update.kind === "developed") {
        localFiles.set(update.photoId, item.uri);
        return { ...item, status: { kind: "developed", photoId: update.photoId } };
      }
      // A cancelled file leaves the tray: it was never on the roll.
      if (update.reason === "cancelled") {
        if (activeUserId) releaseUploadFile(activeUserId, item.uri);
        return null;
      }
      return { ...item, status: { kind: "failed", reason: update.reason } };
    },
    durable,
  );
};

/** Sends whatever is waiting, until nothing is, then refreshes the roll. */
const run = async (eventId: string) => {
  if (getTray(eventId).running) return;
  const controller = new AbortController();
  controllers.set(eventId, controller);
  const requests = new AbortController();
  requestControllers.set(eventId, requests);
  const isCurrent = () => controllers.get(eventId) === controller;
  setTray(eventId, (tray) => ({ ...tray, running: true }));

  try {
    for (;;) {
      if (!isCurrent() || controller.signal.aborted) break;
      const waiting = getTray(eventId).items.filter((item) => item.status.kind === "waiting");
      if (waiting.length === 0) break;
      await uploadEventPhotos(
        eventId,
        waiting.map(({ uri, contentType, sizeBytes, minted }) => ({
          uri,
          contentType,
          sizeBytes,
          resumePhotoId: minted?.photoId,
        })),
        {
          signal: controller.signal,
          requestSignal: requests.signal,
          onMinted: (minted) => {
            if (!isCurrent()) return;
            mintSeq += 1;
            const seq = mintSeq;
            const ids = new Map(
              minted.flatMap(({ index, photoId }) => {
                const item = waiting[index];
                return item ? [[item.key, photoId] as const] : [];
              }),
            );
            mapItems(eventId, (item) => {
              const photoId = ids.get(item.key);
              return photoId ? { ...item, minted: { photoId, seq } } : item;
            });
          },
          onFile: (index, update) => {
            const item = waiting[index];
            if (item && isCurrent()) applyUpdate(eventId, item.key, update);
          },
        },
      );
    }
  } finally {
    // A cleared account's run must never settle, restart or overwrite a later run.
    if (!isCurrent()) return;
    let refreshed = false;
    try {
      await settlers.get(eventId)?.();
      refreshed = true;
    } catch {
      // Keep confirmed frames visible locally until a later refresh succeeds.
    }
    if (!isCurrent()) return;
    controllers.delete(eventId);
    requestControllers.delete(eventId);
    // Developed frames are on the sheet now; what's left is what needs a word.
    if (trays.has(eventId)) {
      setTray(eventId, (tray) => ({
        ...tray,
        running: false,
        items: refreshed ? tray.items.filter((item) => item.status.kind !== "developed") : tray.items,
      }));
      // Photos picked while the roll was refreshing found it still running; they go now.
      if (getTray(eventId).items.some((item) => item.status.kind === "waiting")) void run(eventId);
      else if (
        connected &&
        getTray(eventId).items.some((item) => item.status.kind === "failed" && item.status.reason === "connection")
      ) {
        const attempt = retryAttempts.get(eventId) ?? 0;
        const delay = [1000, 3000, 10000][attempt];
        if (delay !== undefined) {
          clearRetry(eventId);
          retryAttempts.set(eventId, attempt + 1);
          retryTimers.set(
            eventId,
            setTimeout(() => {
              retryTimers.delete(eventId);
              if (connected) retryTray(eventId, ["connection"], true);
            }, delay),
          );
        }
      }
    }
  }
};

let watchingConnection = false;

/** 08.4: a file that didn't take because the connection dropped goes again once it's back. */
const watchConnection = () => {
  if (watchingConnection) return;
  watchingConnection = true;
  let wasConnected = true;
  NetInfo.addEventListener((state) => {
    connected = state.isConnected !== false && state.isInternetReachable !== false;
    if (connected && !wasConnected) {
      for (const [eventId, tray] of trays) {
        if (tray.items.some((item) => item.status.kind === "failed" && item.status.reason === "connection")) {
          retryAttempts.delete(eventId);
          retryTray(eventId, ["connection"], true);
        }
      }
    }
    wasConnected = connected;
  });
};

/** Puts picked photos in the tray and starts sending the ones that can go. */
export const addToTray = (eventId: string, items: TrayItem[], settle: () => Promise<unknown>) => {
  watchConnection();
  settlers.set(eventId, settle);
  setTray(eventId, (tray) => ({ ...tray, items: [...items, ...tray.items] }));
  void run(eventId);
};

/** Sends the files that didn't take again. Connection, refusal and interruption can work a second time. */
export const retryTray = (
  eventId: string,
  reasons: TrayRetryReason[] = ["connection", "refused", "interrupted"],
  automatic = false,
) => {
  clearRetry(eventId);
  if (!automatic) retryAttempts.delete(eventId);
  mapItems(eventId, (item) =>
    item.status.kind === "failed" && (reasons as string[]).includes(item.status.reason)
      ? // Reconcile the prior reservation before minting again.
        { ...item, status: { kind: "waiting" } }
      : item,
  );
  void run(eventId);
};

export type TrayRetryReason = "connection" | "refused" | "interrupted";

/** "Cancel the rest": stops what's sending and drops what hasn't gone. */
export const cancelTray = (eventId: string) => {
  clearRetry(eventId);
  retryAttempts.delete(eventId);
  controllers.get(eventId)?.abort();
  mapItems(eventId, (item) => {
    if (item.status.kind !== "waiting" && !(item.status.kind === "failed" && item.status.reason === "connection"))
      return item;
    if (activeUserId) releaseUploadFile(activeUserId, item.uri);
    return null;
  });
};

/** Takes one file off the tray: a rejected one (08.5), or one that won't go. */
export const removeFromTray = (eventId: string, key: string) =>
  mapItems(eventId, (item) => {
    if (item.key !== key) return item;
    if (activeUserId) releaseUploadFile(activeUserId, item.uri);
    return null;
  });

/** 08.8 "Ok": the files the closed roll refused leave the tray. */
export const dismissClosed = (eventId: string) =>
  setTray(eventId, (tray) => ({
    ...tray,
    closed: null,
    items: tray.items.filter((item) => !(item.status.kind === "failed" && item.status.reason === "closed")),
  }));

/** Sign-out: nothing one account picked may carry on for the next. */
export const clearUploadTrays = () => {
  const oldUserId = activeUserId;
  activeUserId = null;
  retryTimers.forEach(clearTimeout);
  retryTimers.clear();
  retryAttempts.clear();
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
  requestControllers.forEach((controller) => controller.abort());
  requestControllers.clear();
  settlers.clear();
  trays.clear();
  localFiles.clear();
  if (oldUserId) removeUploadStorage(oldUserId);
  emit();
};

/** Restore only the authenticated account; interrupted jobs wait for explicit Retry. */
export const activateUploadTrays = (userId: string, settle: (eventId: string) => Promise<unknown>) => {
  if (activeUserId === userId) return;
  clearUploadTrays();
  activeUserId = userId;
  for (const [eventId, tray] of restoreUploadTrays(userId)) {
    trays.set(eventId, tray);
    mintSeq = Math.max(mintSeq, ...tray.items.map((item) => item.minted?.seq ?? 0));
    settlers.set(eventId, () => settle(eventId));
  }
  watchConnection();
  emit();
};

/** A completed server photo wins over a stale local failure after a lost response. */
export const reconcileTrayPhotos = (eventId: string, photos: Pick<PhotoResponseDto, "id">[]) => {
  const ready = new Set(photos.map((photo) => photo.id));
  const tray = getTray(eventId);
  if (!tray.items.some((entry) => entry.minted && ready.has(entry.minted.photoId))) return;
  mapItems(eventId, (entry) => {
    if (
      !entry.minted ||
      !ready.has(entry.minted.photoId) ||
      entry.status.kind === "sending" ||
      entry.status.kind === "waiting"
    )
      return entry;
    localFiles.set(entry.minted.photoId, entry.uri);
    return null;
  });
};

export const releaseLocalFile = (photoId: string) => {
  const uri = localFiles.get(photoId);
  if (uri && activeUserId) releaseUploadFile(activeUserId, uri);
  localFiles.delete(photoId);
};

onAccountCleared(clearUploadTrays);

export const useUploadTray = (eventId: string | undefined): Tray =>
  useSyncExternalStore(subscribe, () => (eventId ? getTray(eventId) : EMPTY_TRAY));
