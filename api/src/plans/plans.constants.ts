/**
 * What an account may do whatever its events' plans are. Everyone is on FREE
 * until a host subscription exists; it is the seam that subscription plugs
 * into (EventPlanService.accountPlanFor).
 */
export const ACCOUNT_PLANS = {
  FREE: "FREE",
} as const;

export type AccountPlan = (typeof ACCOUNT_PLANS)[keyof typeof ACCOUNT_PLANS];

export interface AccountPlanLimits {
  /** Events the account created that haven't closed, upcoming ones included; null for no limit. Joining never counts. */
  maxActiveEvents: number | null;
}

export const ACCOUNT_PLAN_LIMITS: Record<AccountPlan, AccountPlanLimits> = {
  FREE: { maxActiveEvents: 2 },
};

/** Whether an event's gallery takes photos yet, or still; see galleryStateOf. */
export const GALLERY_STATES = {
  UPCOMING: "UPCOMING",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

export type GalleryState = (typeof GALLERY_STATES)[keyof typeof GALLERY_STATES];

const DAY_MS = 24 * 60 * 60 * 1000;

/** When an event's gallery opens and closes. */
export interface GallerySchedule {
  galleryOpensAt: Date;
  /** Null when the plan never closes a gallery. */
  galleryClosesAt: Date | null;
}

/**
 * The schedule of a gallery for an event on `date`, open for `windowDays`. It
 * opens at the later of the date and `now`, the moment the event is created or
 * (while upcoming) rescheduled, so creating an event early never lengthens its
 * gallery and a past date never shortens it.
 */
export const gallerySchedule = (date: Date, windowDays: number | null, now: Date = new Date()): GallerySchedule => {
  const galleryOpensAt = new Date(Math.max(date.getTime(), now.getTime()));
  return {
    galleryOpensAt,
    galleryClosesAt: windowDays === null ? null : new Date(galleryOpensAt.getTime() + windowDays * DAY_MS),
  };
};

/**
 * UPCOMING until the gallery opens. CLOSED once the close job has run, or once
 * the close time has passed: the job runs hourly, and a gallery must not take
 * photos in the gap.
 */
export const galleryStateOf = (
  event: { galleryOpensAt: Date; galleryClosesAt: Date | null; galleryClosedAt: Date | null },
  now: Date = new Date(),
): GalleryState => {
  if (event.galleryClosedAt) return GALLERY_STATES.CLOSED;
  if (event.galleryClosesAt && event.galleryClosesAt.getTime() <= now.getTime()) return GALLERY_STATES.CLOSED;
  if (event.galleryOpensAt.getTime() > now.getTime()) return GALLERY_STATES.UPCOMING;
  return GALLERY_STATES.OPEN;
};
