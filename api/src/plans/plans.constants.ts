import { EventPlan } from "generated/prisma/client";

/**
 * What an event on each plan starts with (docs/event-quotas.md). These are
 * copied onto the event (`Event.memberLimit`, `Event.storageLimitBytes`,
 * `Event.galleryClosesAt`) when it is created or upgraded, and the checks read
 * the event, never this map. Changing a number here changes only events
 * created or upgraded afterwards. A paid plan is a new EventPlan value plus
 * its row: the Record type refuses to compile until every plan has one.
 * `null` means no limit.
 */
export interface EventPlanLimits {
  /** Members of every role, organizers included. */
  maxMembers: number | null;
  /**
   * The gallery's storage, the one limit on what it holds: the bytes of its
   * PENDING and READY photos, whoever uploaded them. Shown to users as
   * storage ("1.2 GB of 3 GB"), never as a number of photos.
   */
  maxGalleryBytes: bigint | null;
  /** Days after the event's date that its gallery stays open; null never closes. */
  galleryWindowDays: number | null;
}

export const EVENT_PLAN_LIMITS: Record<EventPlan, EventPlanLimits> = {
  FREE: {
    maxMembers: 30,
    maxGalleryBytes: 3n * 1024n * 1024n * 1024n,
    galleryWindowDays: 30,
  },
};

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
  /** Events the account created whose galleries are still open. Joining never counts. */
  maxActiveEvents: number;
}

export const ACCOUNT_PLAN_LIMITS: Record<AccountPlan, AccountPlanLimits> = {
  FREE: { maxActiveEvents: 2 },
};

/**
 * Why a plan refused a request (docs/event-quotas.md). Every one is a 403. The
 * app takes the numbers for its copy from the event's `limits` and `usage`.
 */
export const PLAN_LIMIT_CODES = {
  ACTIVE_EVENT_LIMIT_REACHED: "ACTIVE_EVENT_LIMIT_REACHED",
  EVENT_MEMBER_LIMIT_REACHED: "EVENT_MEMBER_LIMIT_REACHED",
  EVENT_STORAGE_LIMIT_REACHED: "EVENT_STORAGE_LIMIT_REACHED",
  EVENT_GALLERY_CLOSED: "EVENT_GALLERY_CLOSED",
} as const;

export const PLAN_LIMIT_MESSAGES = {
  ACTIVE_EVENT_LIMIT_REACHED: (limit: number) =>
    `You already have ${limit} active events. One frees up when a gallery closes or you delete an event.`,
  EVENT_MEMBER_LIMIT_REACHED: (limit: number) => `This event is full: it has reached ${limit} members.`,
  EVENT_STORAGE_LIMIT_REACHED: "This gallery is full: there isn't enough storage left for these photos.",
  EVENT_GALLERY_CLOSED: "This event's gallery has closed.",
};

/** Whether an event's gallery still takes photos; see galleryStateOf. */
export const GALLERY_STATES = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

export type GalleryState = (typeof GALLERY_STATES)[keyof typeof GALLERY_STATES];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The limits an event takes on when it is created on, or upgraded to, `plan`. */
export const planLimitsForEvent = (
  plan: EventPlan,
): { plan: EventPlan; memberLimit: number | null; storageLimitBytes: bigint | null } => ({
  plan,
  memberLimit: EVENT_PLAN_LIMITS[plan].maxMembers,
  storageLimitBytes: EVENT_PLAN_LIMITS[plan].maxGalleryBytes,
});

/** When a gallery on `plan` closes for an event on `date`; null when the plan never closes it. */
export const galleryClosesAt = (date: Date, plan: EventPlan): Date | null => {
  const days = EVENT_PLAN_LIMITS[plan].galleryWindowDays;
  return days === null ? null : new Date(date.getTime() + days * DAY_MS);
};

/**
 * CLOSED once the close job has run, or once the close time has passed: the
 * job runs hourly, and a gallery must not take photos in the gap.
 */
export const galleryStateOf = (
  event: { galleryClosesAt: Date | null; galleryClosedAt: Date | null },
  now: Date = new Date(),
): GalleryState => {
  if (event.galleryClosedAt) return GALLERY_STATES.CLOSED;
  if (event.galleryClosesAt && event.galleryClosesAt.getTime() <= now.getTime()) return GALLERY_STATES.CLOSED;
  return GALLERY_STATES.OPEN;
};
