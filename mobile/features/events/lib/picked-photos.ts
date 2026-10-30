import { MAX_PHOTO_SIZE_BYTES, type EventPhotoFile } from "../api/upload-event-photos";
import type { TrayItem } from "./upload-tray";

/** What the app knows about one picked file once it has been measured. */
export type PickedFile = EventPhotoFile & {
  /** The library's file name, such as "IMG_2231.HEIC"; null when the picker doesn't say. */
  fileName: string | null;
  isVideo: boolean;
};

/** "IMG_2231" for a photo; a video keeps its extension so "IMG_2260.MOV" says what it is. */
export const trayName = (file: Pick<PickedFile, "fileName" | "isVideo">, fallback: string): string => {
  if (!file.fileName) return fallback;
  return file.isVideo ? file.fileName : file.fileName.replace(/\.[^.]+$/, "");
};

let nextKey = Date.now();

/**
 * 08.5: a video or a photo over 25 MB can't be added. They go in the tray as
 * rejected, so it can say why; everything else waits to be sent.
 */
export const toTrayItems = (files: PickedFile[], fallbackName: (index: number) => string): TrayItem[] =>
  files.map((file, index) => {
    nextKey += 1;
    const { uri, contentType, sizeBytes } = file;
    return {
      key: `picked-${nextKey}`,
      name: trayName(file, fallbackName(index)),
      uri,
      contentType,
      sizeBytes,
      status: file.isVideo
        ? { kind: "rejected", reason: "video" }
        : sizeBytes > MAX_PHOTO_SIZE_BYTES
          ? { kind: "rejected", reason: "tooLarge" }
          : { kind: "waiting" },
    };
  });

/** 08.6: the room left can't take every waiting photo. */
export type RoomShortfall = {
  /** The smallest photos that fit, smallest first. */
  fits: TrayItem[];
  /** How many could be sent if there were room. */
  wanted: number;
};

/**
 * Null when the waiting photos fit in `leftBytes` (or the roll has no limit).
 * Otherwise the smallest of them that fit together.
 */
export const roomShortfall = (items: TrayItem[], leftBytes: number | null): RoomShortfall | null => {
  if (leftBytes === null) return null;
  const waiting = items.filter((item) => item.status.kind === "waiting");
  const needed = waiting.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (needed <= leftBytes) return null;

  const fits: TrayItem[] = [];
  let used = 0;
  for (const item of [...waiting].sort((a, b) => a.sizeBytes - b.sizeBytes)) {
    if (used + item.sizeBytes > leftBytes) break;
    fits.push(item);
    used += item.sizeBytes;
  }
  return { fits, wanted: waiting.length };
};
