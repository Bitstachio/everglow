import { onAccountCleared } from "@/lib/account-cleared";
import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";
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
  /** The gallery refused a batch for being closed (08.8): when, and how many had landed by then. */
  closed: { at: string; landed: number } | null;
};

const EMPTY_TRAY: Tray = { items: [], running: false, closed: null };

const trays = new Map<string, Tray>();
const controllers = new Map<string, AbortController>();
/** Refreshes the roll once a run ends: its photos and storage changed. */
const settlers = new Map<string, () => Promise<unknown>>();
const listeners = new Set<() => void>();
/** The local file of each photo this phone added, so its frame never blanks while the roll's copy loads. */
const localFiles = new Map<string, string>();

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

const setTray = (eventId: string, update: (tray: Tray) => Tray) => {
  const next = update(getTray(eventId));
  if (next.items.length === 0 && !next.running && next.closed === null) trays.delete(eventId);
  else trays.set(eventId, next);
  emit();
};

const mapItems = (eventId: string, map: (item: TrayItem) => TrayItem | null) =>
  setTray(eventId, (tray) => ({
    ...tray,
    items: tray.items.map(map).filter((item): item is TrayItem => item !== null),
  }));

const applyUpdate = (eventId: string, key: string, update: EventPhotoUpdate) => {
  if (update.kind === "failed" && update.reason === "closed") {
    setTray(eventId, (tray) => ({
      ...tray,
      closed: tray.closed ?? {
        at: new Date().toISOString(),
        landed: tray.items.filter((item) => item.status.kind === "developed").length,
      },
    }));
  }
  mapItems(eventId, (item) => {
    if (item.key !== key) return item;
    if (update.kind === "sending") return { ...item, status: { kind: "sending", bytesSent: update.bytesSent } };
    if (update.kind === "developed") {
      localFiles.set(update.photoId, item.uri);
      return { ...item, status: { kind: "developed", photoId: update.photoId } };
    }
    // A cancelled file leaves the tray: it was never on the roll.
    if (update.reason === "cancelled") return null;
    return { ...item, status: { kind: "failed", reason: update.reason } };
  });
};

/** Sends whatever is waiting, until nothing is, then refreshes the roll. */
const run = async (eventId: string) => {
  if (getTray(eventId).running) return;
  const controller = new AbortController();
  controllers.set(eventId, controller);
  setTray(eventId, (tray) => ({ ...tray, running: true }));

  try {
    for (;;) {
      if (controller.signal.aborted) break;
      const waiting = getTray(eventId).items.filter((item) => item.status.kind === "waiting");
      if (waiting.length === 0) break;
      await uploadEventPhotos(
        eventId,
        waiting.map(({ uri, contentType, sizeBytes }) => ({ uri, contentType, sizeBytes })),
        {
          signal: controller.signal,
          onMinted: (minted) => {
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
            if (item) applyUpdate(eventId, item.key, update);
          },
        },
      );
    }
  } finally {
    controllers.delete(eventId);
    try {
      await settlers.get(eventId)?.();
    } catch {
      // The roll refreshes on its own next time; the tray still has to settle.
    }
    // Developed frames are on the sheet now; what's left is what needs a word.
    if (trays.has(eventId)) {
      setTray(eventId, (tray) => ({
        ...tray,
        running: false,
        items: tray.items.filter((item) => item.status.kind !== "developed"),
      }));
      // Photos picked while the roll was refreshing found it still running; they go now.
      if (getTray(eventId).items.some((item) => item.status.kind === "waiting")) void run(eventId);
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
    const connected = state.isConnected !== false;
    if (connected && !wasConnected) {
      for (const [eventId, tray] of trays) {
        if (tray.items.some((item) => item.status.kind === "failed" && item.status.reason === "connection")) {
          retryTray(eventId, ["connection"]);
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

/** Sends the files that didn't take again. Only connection and refused failures can work a second time. */
export const retryTray = (eventId: string, reasons: TrayRetryReason[] = ["connection", "refused"]) => {
  mapItems(eventId, (item) =>
    item.status.kind === "failed" && (reasons as string[]).includes(item.status.reason)
      ? // A retry mints a new slot, so it gets a new photo id.
        { ...item, status: { kind: "waiting" }, minted: undefined }
      : item,
  );
  void run(eventId);
};

export type TrayRetryReason = "connection" | "refused";

/** "Cancel the rest": stops what's sending and drops what hasn't gone. */
export const cancelTray = (eventId: string) => {
  controllers.get(eventId)?.abort();
  mapItems(eventId, (item) => (item.status.kind === "waiting" ? null : item));
};

/** Takes one file off the tray: a rejected one (08.5), or one that won't go. */
export const removeFromTray = (eventId: string, key: string) =>
  mapItems(eventId, (item) => (item.key === key ? null : item));

/** 08.8 "Ok": the files the closed roll refused leave the tray. */
export const dismissClosed = (eventId: string) =>
  setTray(eventId, (tray) => ({
    ...tray,
    closed: null,
    items: tray.items.filter((item) => !(item.status.kind === "failed" && item.status.reason === "closed")),
  }));

/** Sign-out: nothing one account picked may carry on for the next. */
export const clearUploadTrays = () => {
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
  settlers.clear();
  trays.clear();
  localFiles.clear();
  emit();
};

onAccountCleared(clearUploadTrays);

export const useUploadTray = (eventId: string | undefined): Tray =>
  useSyncExternalStore(subscribe, () => (eventId ? getTray(eventId) : EMPTY_TRAY));

/** What the tray adds up to, for the line over the shutter and the tray's title. */
export type TraySummary = {
  /** Files that can go: everything but the rejected. */
  sendable: number;
  developed: number;
  /** Waiting or sending. */
  inFlight: number;
  /** Failed for a reason retrying can fix. */
  retryable: number;
  /** Of those, failed because the connection dropped. */
  offline: number;
  noRoom: number;
  closed: number;
  rejected: number;
};

export const summarizeTray = (tray: Tray): TraySummary => {
  const summary: TraySummary = {
    sendable: 0,
    developed: 0,
    inFlight: 0,
    retryable: 0,
    offline: 0,
    noRoom: 0,
    closed: 0,
    rejected: 0,
  };
  for (const { status } of tray.items) {
    if (status.kind === "rejected") {
      summary.rejected += 1;
      continue;
    }
    summary.sendable += 1;
    if (status.kind === "developed") summary.developed += 1;
    else if (status.kind === "waiting" || status.kind === "sending") summary.inFlight += 1;
    else if (status.reason === "noRoom") summary.noRoom += 1;
    else if (status.reason === "closed") summary.closed += 1;
    else {
      summary.retryable += 1;
      if (status.reason === "connection") summary.offline += 1;
    }
  }
  return summary;
};

/** How far a file has developed, from 0 (just picked) to 1 (on the roll). */
export const developedAmount = (item: TrayItem): number => {
  const { status } = item;
  if (status.kind === "developed") return 1;
  if (status.kind === "sending") return item.sizeBytes > 0 ? Math.min(0.9, status.bytesSent / item.sizeBytes) : 0;
  return 0;
};

/** A picked photo on the sheet before it's on the roll (08.2, 08.4, 08.8). */
export type DevelopingFrame = {
  item: TrayItem;
  /** The number it takes on the roll, after the frames already there. */
  number: number;
  /** 0 (just picked) to 1 (developed). */
  develop: number;
  /** It didn't make it: crossed out where it was. */
  crossed: boolean;
};

/**
 * The roll lists photos newest first: a later mint first, and within one mint
 * (one timestamp) by id, descending. Files not minted yet will be newer still.
 */
const sheetOrder = (a: TrayItem, b: TrayItem): number => {
  if (!a.minted || !b.minted) return (a.minted ? 1 : 0) - (b.minted ? 1 : 0);
  if (a.minted.seq !== b.minted.seq) return b.minted.seq - a.minted.seq;
  return a.minted.photoId < b.minted.photoId ? 1 : a.minted.photoId > b.minted.photoId ? -1 : 0;
};

/**
 * The tray's photos at the top of the sheet, in the order the roll will list
 * them once they land, until the roll's own photos include them. Rejected
 * files never reach the sheet.
 */
export const developingFrames = (
  items: TrayItem[],
  photos: Pick<PhotoResponseDto, "id">[],
  frameCount: number,
): DevelopingFrame[] => {
  const onRoll = new Set(photos.map((photo) => photo.id));
  const pending = items
    .filter(({ status }) => status.kind !== "rejected" && !(status.kind === "developed" && onRoll.has(status.photoId)))
    .sort(sheetOrder);
  return pending.map((item, index) => ({
    item,
    number: frameCount + pending.length - index,
    develop: developedAmount(item),
    crossed: item.status.kind === "failed",
  }));
};

/** A file in the tray with the frame number it has, or will have, on the roll. */
export type TrayEntry = { item: TrayItem; number: number | null; develop: number };

/** 08.3 / 08.5: every file in the tray, numbered as on the sheet. One already on the roll keeps its number there. */
export const trayEntries = (items: TrayItem[], photos: Pick<PhotoResponseDto, "id">[]): TrayEntry[] => {
  const frames = new Map(developingFrames(items, photos, photos.length).map((frame) => [frame.item.key, frame]));
  return items.map((item) => {
    const frame = frames.get(item.key);
    if (frame) return { item, number: frame.number, develop: frame.develop };
    const { status } = item;
    // The roll lists photos newest first.
    const index = status.kind === "developed" ? photos.findIndex((photo) => photo.id === status.photoId) : -1;
    return index === -1 ? { item, number: null, develop: 0 } : { item, number: photos.length - index, develop: 1 };
  });
};
