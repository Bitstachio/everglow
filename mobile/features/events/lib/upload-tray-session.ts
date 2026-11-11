import type { Tray, TrayItem } from "./upload-tray";

/**
 * On the roll, as a new frame or as the frame that already had these bytes:
 * nothing more to do, so it leaves the tray once the roll refreshes.
 */
export const isFinished = (item: TrayItem): boolean =>
  item.status.kind === "developed" || item.status.kind === "onRoll";

/** Completed rows are presentation history for one visit, never durable jobs. */
export const retainCompletedTrayRows = (previous: Tray, current: Tray): Tray => {
  const live = new Map(current.items.map((item) => [item.key, item]));
  const seen = new Set(previous.items.map((item) => item.key));
  const existing = previous.items
    .map((item) => live.get(item.key) ?? (isFinished(item) ? item : null))
    .filter((item): item is TrayItem => item !== null);
  return { ...current, items: [...current.items.filter((item) => !seen.has(item.key)), ...existing] };
};
