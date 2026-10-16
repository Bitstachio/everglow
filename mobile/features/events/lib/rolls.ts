import type { EventResponseDto } from "../types";

/**
 * Home groups every roll by its gallery state (03.3–03.4): the live rolls
 * first — last day soonest — then upcoming, then the closed ones below.
 */
export type GroupedRolls = {
  /** OPEN rolls, the one closing soonest first. */
  live: EventResponseDto[];
  /** UPCOMING rolls, the one opening soonest first. */
  upcoming: EventResponseDto[];
  /** CLOSED rolls, most recently closed first. */
  closed: EventResponseDto[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const time = (iso: string | null): number => (iso ? new Date(iso).getTime() : NaN);

/** When a closed roll's photos were removed: cut short, or the window's end. */
const closedAt = (event: EventResponseDto): number =>
  time(event.deactivatedAt) || time(event.galleryClosesAt) || time(event.updatedAt);

export const groupRolls = (events: EventResponseDto[]): GroupedRolls => {
  const live = events.filter((event) => event.galleryState === "OPEN");
  const upcoming = events.filter((event) => event.galleryState === "UPCOMING");
  const closed = events.filter((event) => event.galleryState === "CLOSED");

  // Soonest to close first; a roll that never closes sits after the dated ones.
  live.sort((a, b) => (time(a.galleryClosesAt) || Infinity) - (time(b.galleryClosesAt) || Infinity));
  upcoming.sort((a, b) => time(a.galleryOpensAt) - time(b.galleryOpensAt));
  closed.sort((a, b) => closedAt(b) - closedAt(a));

  return { live, upcoming, closed };
};

/**
 * The line of edge print on the right of a roll, as a descriptor so the screen
 * owns the words (`home` namespace) and this stays testable.
 */
export type RollTime =
  | { kind: "closingSoon"; hours: number; minutes: number }
  | { kind: "closesOn"; iso: string }
  | { kind: "open" }
  | { kind: "opensOn"; iso: string }
  | { kind: "closedOn"; iso: string };

export const rollTime = (event: EventResponseDto, now: Date = new Date()): RollTime => {
  if (event.galleryState === "UPCOMING") return { kind: "opensOn", iso: event.galleryOpensAt };
  if (event.galleryState === "CLOSED") {
    return { kind: "closedOn", iso: event.deactivatedAt ?? event.galleryClosesAt ?? event.updatedAt };
  }

  // OPEN
  if (!event.galleryClosesAt) return { kind: "open" };
  const msLeft = new Date(event.galleryClosesAt).getTime() - now.getTime();
  if (msLeft <= DAY_MS) {
    const left = Math.max(0, msLeft);
    return {
      kind: "closingSoon",
      hours: Math.floor(left / (60 * 60 * 1000)),
      minutes: Math.floor((left % (60 * 60 * 1000)) / (60 * 1000)),
    };
  }
  return { kind: "closesOn", iso: event.galleryClosesAt };
};

/** On its last day, an open roll's time is circled in pencil (03.3). */
export const isLastDay = (event: EventResponseDto, now: Date = new Date()): boolean =>
  rollTime(event, now).kind === "closingSoon";

/** "21 Nov": how long an open roll stays open. */
export const formatClosesOn = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "Fri 21:00": when an upcoming roll opens. */
export const formatOpensOn = (iso: string): string => {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const time24 = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${weekday} ${time24}`;
};

/** "21.09": the day a closed roll's photos went. */
export const formatClosedOn = (iso: string): string => {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
};
