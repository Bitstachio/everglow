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

/**
 * Why a plan, or a gallery's schedule, refused a request (docs/event-quotas.md).
 * Every one is a 403. The app takes the numbers for its copy from the event's
 * `limits` and `usage`, or from GET /users/me/limits for the account's. The
 * event limits themselves live in the Plan table, not in code.
 */
export const PLAN_LIMIT_CODES = {
  ACTIVE_EVENT_LIMIT_REACHED: "ACTIVE_EVENT_LIMIT_REACHED",
  EVENT_MEMBER_LIMIT_REACHED: "EVENT_MEMBER_LIMIT_REACHED",
  EVENT_STORAGE_LIMIT_REACHED: "EVENT_STORAGE_LIMIT_REACHED",
  EVENT_GALLERY_CLOSED: "EVENT_GALLERY_CLOSED",
  EVENT_GALLERY_NOT_OPEN: "EVENT_GALLERY_NOT_OPEN",
  EVENT_SCHEDULE_LOCKED: "EVENT_SCHEDULE_LOCKED",
} as const;

export const PLAN_LIMIT_MESSAGES = {
  ACTIVE_EVENT_LIMIT_REACHED: (limit: number) =>
    `You already have ${limit} active events. One frees up when a gallery closes or you delete an event.`,
  EVENT_MEMBER_LIMIT_REACHED: (limit: number) => `This event is full: it has reached ${limit} members.`,
  EVENT_STORAGE_LIMIT_REACHED: "This gallery is full: there isn't enough storage left for these photos.",
  EVENT_GALLERY_CLOSED: "This event's gallery has closed.",
  EVENT_GALLERY_NOT_OPEN: "This event's gallery hasn't opened yet: photos can be added from the event's date.",
  EVENT_SCHEDULE_LOCKED: "The date and the gallery length can only change before the gallery opens.",
  // A 400 without a code: the app offers only the plan's options, which it
  // reads from GET /users/me/limits.
  INVALID_GALLERY_WINDOW: (options: readonly number[]) =>
    options.length === 0
      ? "This event's plan has no gallery length to choose."
      : `The gallery length must be one of ${options.join(", ")} days.`,
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
