import type { RollPhoto } from "./rolls";
import type { Event } from "../types";

/**
 * The roll just left, as its card on Home looked: Home keeps the card in its
 * place while it goes (13.3). Its queries are gone by then, so its strip
 * travels with it.
 */
export type LeftRoll = { event: Event; photos: RollPhoto[] };

/** The roll just left, waiting to be read once when Home is shown. */
let pending: LeftRoll | null = null;

export const noteLeftRoll = (roll: LeftRoll) => {
  pending = roll;
};

export const takeLeftRoll = (): LeftRoll | null => {
  const roll = pending;
  pending = null;
  return roll;
};

/**
 * How the left roll goes from Home: its card stays until the screen has
 * settled, then fades while the cards below close the gap. Eased, no bounce.
 */
export const LEAVE_MOTION = {
  /** The card in its place, once Home has come back. */
  holdMs: 450,
  fadeMs: 180,
  /** The cards below start moving as the card is almost gone. */
  slideDelayMs: 120,
  slideMs: 260,
} as const;

/** From the card starting to go until the list has settled. */
export const LEAVE_SETTLE_MS = Math.max(LEAVE_MOTION.fadeMs, LEAVE_MOTION.slideDelayMs + LEAVE_MOTION.slideMs);
