import type { PhotoResponseDto } from "../types";
import type { Tray, TrayItem } from "./upload-tray";

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
    if (status.kind === "failed" && status.reason === "missing") {
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
