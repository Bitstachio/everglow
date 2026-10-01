import { ForbiddenException, Injectable } from "@nestjs/common";
import { Event, EventPlan, PhotoStatus, Prisma } from "generated/prisma/client";
import { lockForTransaction } from "src/prisma/advisory-lock";
import { PrismaService } from "src/prisma/prisma.service";
import {
  ACCOUNT_PLAN_LIMITS,
  ACCOUNT_PLANS,
  AccountPlan,
  AccountPlanLimits,
  EVENT_PLAN_LIMITS,
  EventPlanLimits,
  GALLERY_STATES,
  galleryStateOf,
  PLAN_LIMIT_CODES,
  PLAN_LIMIT_MESSAGES,
} from "./plans.constants";

/** What an event holds now, measured the way its limits are. */
export interface EventUsage {
  members: number;
  photos: number;
}

/** The fields of an event its plan limits depend on. */
export type PlannedEvent = Pick<Event, "id" | "plan" | "galleryClosesAt" | "galleryClosedAt">;

const NO_USAGE: EventUsage = { members: 0, photos: 0 };

/** Photos that take room in a gallery: uploads in progress and finished ones. */
const GALLERY_PHOTO_STATUSES = [PhotoStatus.PENDING, PhotoStatus.READY];

/**
 * Events a user created whose galleries are still open: the ones that count
 * toward the account's active-event limit. Joined, closed and deleted events
 * never do.
 */
export const activeEventsCreatedBy = (userId: string, now: Date = new Date()): Prisma.EventWhereInput => ({
  creatorId: userId,
  galleryClosedAt: null,
  OR: [{ galleryClosesAt: null }, { galleryClosesAt: { gt: now } }],
});

/**
 * The one place that answers "what may this event or account hold, and how
 * much does it hold now" (docs/event-quotas.md). Enforcement and responses
 * both go through it, so a paid plan changes the numbers here and nowhere else.
 */
@Injectable()
export class EventPlanService {
  constructor(private readonly prisma: PrismaService) {}

  limitsFor(plan: EventPlan): EventPlanLimits {
    return EVENT_PLAN_LIMITS[plan];
  }

  /** Every account is FREE until a host subscription exists. */
  accountPlanFor(userId: string): Promise<AccountPlan> {
    void userId;
    return Promise.resolve(ACCOUNT_PLANS.FREE);
  }

  async accountLimitsFor(userId: string): Promise<AccountPlanLimits> {
    return ACCOUNT_PLAN_LIMITS[await this.accountPlanFor(userId)];
  }

  /** Members and photos per event, in two queries whatever the number of events. */
  async usageFor(eventIds: string[]): Promise<Map<string, EventUsage>> {
    const usage = new Map<string, EventUsage>(eventIds.map((id) => [id, { ...NO_USAGE }]));
    if (eventIds.length === 0) return usage;

    const [members, photos] = await Promise.all([
      this.prisma.eventAccess.groupBy({
        by: ["eventId"],
        where: { eventId: { in: eventIds } },
        _count: { _all: true },
      }),
      this.prisma.photo.groupBy({
        by: ["eventId"],
        where: { eventId: { in: eventIds }, status: { in: GALLERY_PHOTO_STATUSES } },
        _count: { _all: true },
      }),
    ]);

    for (const row of members) usage.get(row.eventId)!.members = row._count._all;
    for (const row of photos) usage.get(row.eventId)!.photos = row._count._all;
    return usage;
  }

  /**
   * Refuses a new event once the creator has as many active events as their
   * account plan allows. Run it in the transaction that creates the event: the
   * lock makes two creates by the same person count one after the other.
   */
  async assertCanCreateEvent(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await lockForTransaction(tx, `event-plan:create:${userId}`);

    const { maxActiveEvents } = await this.accountLimitsFor(userId);
    const active = await tx.event.count({ where: activeEventsCreatedBy(userId) });
    if (active < maxActiveEvents) return;

    // The error envelope carries only code and message; the app reads the
    // counts and the next event to close from GET /users/me/limits.
    throw new ForbiddenException({
      code: PLAN_LIMIT_CODES.ACTIVE_EVENT_LIMIT_REACHED,
      message: PLAN_LIMIT_MESSAGES.ACTIVE_EVENT_LIMIT_REACHED(maxActiveEvents),
    });
  }

  /**
   * Refuses a new member once the event has as many as its plan allows, every
   * role counted. Run it in the transaction that adds the member: the lock
   * makes two joins to the same event count one after the other.
   */
  async assertCanJoin(tx: Prisma.TransactionClient, event: PlannedEvent): Promise<void> {
    const { maxMembers } = this.limitsFor(event.plan);
    if (maxMembers === null) return;

    await lockForTransaction(tx, `event-plan:members:${event.id}`);
    const members = await tx.eventAccess.count({ where: { eventId: event.id } });
    if (members < maxMembers) return;

    throw new ForbiddenException({
      code: PLAN_LIMIT_CODES.EVENT_MEMBER_LIMIT_REACHED,
      message: PLAN_LIMIT_MESSAGES.EVENT_MEMBER_LIMIT_REACHED(maxMembers),
    });
  }

  /** Refuses photos for a gallery that has closed. */
  assertGalleryOpen(event: PlannedEvent): void {
    if (galleryStateOf(event) === GALLERY_STATES.OPEN) return;
    throw new ForbiddenException({
      code: PLAN_LIMIT_CODES.EVENT_GALLERY_CLOSED,
      message: PLAN_LIMIT_MESSAGES.EVENT_GALLERY_CLOSED,
    });
  }

  /**
   * Refuses a batch that would take the gallery past its plan's photo or byte
   * limit. Run it inside the upload reservation's Serializable transaction, so
   * two batches for the same gallery cannot both slip under the limit.
   */
  async assertGalleryHasRoom(
    tx: Prisma.TransactionClient,
    event: PlannedEvent,
    requestedPhotos: number,
    requestedBytes: bigint,
  ): Promise<void> {
    const { maxPhotos, maxGalleryBytes } = this.limitsFor(event.plan);
    if (maxPhotos === null && maxGalleryBytes === null) return;

    const held = await tx.photo.aggregate({
      where: { eventId: event.id, status: { in: GALLERY_PHOTO_STATUSES } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });
    const photos = held._count._all;
    const bytes = BigInt(held._sum.sizeBytes ?? 0);

    if (maxPhotos !== null && photos + requestedPhotos > maxPhotos) {
      throw new ForbiddenException({
        code: PLAN_LIMIT_CODES.EVENT_PHOTO_LIMIT_REACHED,
        message: PLAN_LIMIT_MESSAGES.EVENT_PHOTO_LIMIT_REACHED(maxPhotos),
      });
    }
    // The byte cap is a hidden safety net, so its message names no number.
    if (maxGalleryBytes !== null && bytes + requestedBytes > maxGalleryBytes) {
      throw new ForbiddenException({
        code: PLAN_LIMIT_CODES.EVENT_STORAGE_LIMIT_REACHED,
        message: PLAN_LIMIT_MESSAGES.EVENT_STORAGE_LIMIT_REACHED,
      });
    }
  }
}
