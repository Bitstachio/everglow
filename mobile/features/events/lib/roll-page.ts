import { formatStorageBytes } from "../utils";
import { isLastDay } from "./rolls";
import type { EventParticipantResponseDto, EventResponseDto, PhotoResponseDto } from "../types";

/**
 * The event page (chapter 07) is one screen through the roll's whole life.
 * These helpers pick what it shows from the event, the caller's role and the
 * clock, so the screen owns the words and this stays testable.
 */

/** Hosts send envelopes, guests add photos, view-only guests look and save. */
export type RollRole = "host" | "guest" | "viewer";

/**
 * - upcoming: 07.1 / 07.2, before the gallery opens
 * - empty: 07.4, open with no frames yet
 * - open: 07.5–07.8, the contact sheet
 * - closed: 07.9, the photos are gone
 * - underReview / suspended: 07.10 / 07.11, held by Everglow
 */
export type RollStage = "upcoming" | "empty" | "open" | "closed" | "underReview" | "suspended";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const rollRole = (
  event: Pick<EventResponseDto, "creatorId">,
  participants: EventParticipantResponseDto[],
  userId: string | undefined,
): RollRole => {
  if (!userId) return "viewer";
  const accessLevel = participants.find((participant) => participant.userId === userId)?.accessLevel;
  if (accessLevel === "ORGANIZER" || (accessLevel === undefined && event.creatorId === userId)) return "host";
  return accessLevel === "VIEWER" ? "viewer" : "guest";
};

/** Moderation comes first: a held roll says so whatever its gallery is doing. */
export const rollStage = (event: Pick<EventResponseDto, "status" | "galleryState">, frameCount: number): RollStage => {
  if (event.status === "SUSPENDED") return "suspended";
  if (event.galleryState === "CLOSED") return "closed";
  if (event.status === "UNDER_REVIEW") return "underReview";
  if (event.galleryState === "UPCOMING") return "upcoming";
  return frameCount === 0 ? "empty" : "open";
};

/** How long until something happens, in the largest unit that reads well. */
export type Duration = { kind: "days"; days: number } | { kind: "hoursMinutes"; hours: number; minutes: number };

export const durationUntil = (iso: string, now: Date): Duration => {
  const ms = Math.max(0, new Date(iso).getTime() - now.getTime());
  if (ms > DAY_MS) return { kind: "days", days: Math.ceil(ms / DAY_MS) };
  return { kind: "hoursMinutes", hours: Math.floor(ms / HOUR_MS), minutes: Math.floor((ms % HOUR_MS) / MINUTE_MS) };
};

/** The middle of the band: when it opens, how long is left, or why it's held. */
export type BandTime =
  | { kind: "opensIn"; duration: Duration }
  | { kind: "left"; duration: Duration }
  | { kind: "open" }
  | { kind: "onHold" }
  | { kind: "suspended" };

export const bandTime = (
  event: Pick<EventResponseDto, "status" | "galleryState" | "galleryOpensAt" | "galleryClosesAt">,
  now: Date,
): BandTime => {
  if (event.status === "SUSPENDED") return { kind: "suspended" };
  if (event.status === "UNDER_REVIEW") return { kind: "onHold" };
  if (event.galleryState === "UPCOMING") return { kind: "opensIn", duration: durationUntil(event.galleryOpensAt, now) };
  if (!event.galleryClosesAt) return { kind: "open" };
  return { kind: "left", duration: durationUntil(event.galleryClosesAt, now) };
};

/** 07.8: an open roll's last 24 hours, as on Home. The time left and the shutter are circled; not while it's held. */
export const isRollLastDay = (event: EventResponseDto, now: Date): boolean =>
  event.status === "ACTIVE" && isLastDay(event, now);

/** An upcoming roll whose gallery has opened since it loaded. */
export const hasOpened = (event: Pick<EventResponseDto, "galleryState" | "galleryOpensAt">, now: Date): boolean =>
  event.galleryState === "UPCOMING" && new Date(event.galleryOpensAt) <= now;

/**
 * The left of the band. Who adds photos sees the room left; view-only guests,
 * and guests before it opens, see the frame count. A suspended roll is hidden.
 */
export type BandStock = { kind: "storage" } | { kind: "frames" } | { kind: "hidden" };

export const bandStock = (stage: RollStage, role: RollRole): BandStock => {
  if (stage === "suspended") return { kind: "hidden" };
  if (role === "viewer" || (role === "guest" && stage === "upcoming")) return { kind: "frames" };
  return { kind: "storage" };
};

/**
 * "1.2" and "3 GB" for the band's "1.2 / 3 GB". The unit is dropped from the
 * used side only when both share it, so "300 MB" never reads as "300 / 3 GB".
 */
export const storagePair = (usedBytes: number, limitBytes: number): { used: string; limit: string } => {
  // Nothing used reads "0 / 3 GB", not "0 B / 3 GB".
  if (usedBytes <= 0) return { used: "0", limit: formatStorageBytes(limitBytes) };
  const used = formatStorageBytes(usedBytes, { roundDown: true });
  const limit = formatStorageBytes(limitBytes);
  const [usedValue, usedUnit] = used.split(" ");
  return { used: usedUnit === limit.split(" ")[1] ? (usedValue ?? used) : used, limit };
};

/** "Maya" from "Maya Chen". */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** A frame on the contact sheet: newest first, numbered in the order it was added. */
export type SheetFrame = {
  photo: PhotoResponseDto;
  number: number;
  /** The uploader's first name, "You", or null once they've left or deleted their account. */
  by: string | null;
  /** Only current participants can supply an uploader portrait. */
  uploader: Pick<EventParticipantResponseDto, "userId" | "name" | "avatarUrl"> | null;
  /** Added by someone else since the caller last looked. */
  isNew: boolean;
};

export const sheetFrames = (
  photos: PhotoResponseDto[],
  participants: EventParticipantResponseDto[],
  userId: string | undefined,
  lastVisit: string | null,
  you: string,
): SheetFrame[] => {
  const uploaders = new Map(participants.map((participant) => [participant.userId, participant]));
  const since = lastVisit ? new Date(lastVisit).getTime() : null;
  return photos.map((photo, index) => {
    const mine = photo.addedById !== null && photo.addedById === userId;
    const uploader = photo.addedById ? uploaders.get(photo.addedById) : undefined;
    return {
      photo,
      number: photos.length - index,
      by: mine ? you : uploader?.name ? firstName(uploader.name) : null,
      uploader: uploader ?? null,
      isNew: since !== null && !mine && new Date(photo.createdAt).getTime() > since,
    };
  });
};

/**
 * 07.3 shows once, on the first visit after the roll opened, to someone who
 * saw it before it opened.
 */
export const shouldShowOpened = (
  event: Pick<EventResponseDto, "status" | "galleryState" | "galleryOpensAt">,
  lastVisit: string | null,
): boolean =>
  event.status === "ACTIVE" &&
  event.galleryState === "OPEN" &&
  lastVisit !== null &&
  new Date(lastVisit).getTime() < new Date(event.galleryOpensAt).getTime();

/** The host named on the roll: the creator if still on it, else the first host. */
export const hostName = (
  event: Pick<EventResponseDto, "creatorId">,
  participants: EventParticipantResponseDto[],
): string | null => {
  const host =
    participants.find((participant) => participant.userId === event.creatorId) ??
    participants.find((participant) => participant.accessLevel === "ORGANIZER");
  return host ? firstName(host.name) : null;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** "Sat 07.11 · 19:00": when an upcoming roll opens. */
export const formatOpensAt = (iso: string): string => {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  return `${weekday} ${pad(date.getDate())}.${pad(date.getMonth() + 1)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** "16:00": when a roll closed while photos were sending (08.8). */
export const formatClock = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** "Sun 18.10": the roll's date under its name. */
export const formatRollDate = (iso: string): string => {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  return `${weekday} ${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
};

/** "Sep 12 – Sep 21": the life of a closed roll. */
export const formatRange = (fromIso: string, toIso: string): string => {
  const format = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${format(fromIso)} – ${format(toIso)}`;
};
