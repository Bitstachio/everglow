import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale registered in `app/global.css`. tailwind-merge only knows
 * Tailwind's own sizes, so without these it reads `text-body` as a colour and
 * drops it when a colour such as `text-pencil` follows.
 */
const TEXT_SIZES = [
  "body",
  "counter",
  "edge-print",
  "filled-in",
  "filled-in-card",
  "frame-label",
  "input-card",
  "input-handle",
  "input-line",
  "input-name",
  "input-roll",
  "leader-label",
  "name",
  "note",
  "text-button",
  "title-event",
  "title-launch",
  "title-roll",
  "title-screen",
  "title-sheet",
  "title-slip",
  "wordmark",
];

const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: TEXT_SIZES }] } } });

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));
