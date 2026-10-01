import { ForbiddenException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Event, EventPlan, PhotoStatus, Plan, Prisma } from "generated/prisma/client";
import { lockForTransaction } from "src/prisma/advisory-lock";
import { PrismaService } from "src/prisma/prisma.service";
import {
  ACCOUNT_PLAN_LIMITS,
  ACCOUNT_PLANS,
  AccountPlan,
  AccountPlanLimits,
  GALLERY_STATES,
  galleryStateOf,
  PLAN_LIMIT_CODES,
  PLAN_LIMIT_MESSAGES,
} from "./plans.constants";

/** What an event holds now, measured the way its limits are. */
export interface EventUsage {
  members: number;
  /** Bytes of the gallery's PENDING and READY photos. */
  storageBytes: bigint;
}

/** What an event may hold: its plan version's terms, plus anything given to that one event. null means no limit. */
export interface EventLimits {
  plan: EventPlan;
  memberLimit: number | null;
  storageLimitBytes: bigint | null;
}

/** The fields of an event its limits depend on. */
export type PlannedEvent = Pick<Event, "id" | "planId" | "bonusStorageBytes" | "galleryClosesAt" | "galleryClosedAt">;

/** What an account may hold: its plan's terms. null means no limit. */
export interface AccountLimits extends AccountPlanLimits {
  plan: AccountPlan;
}

/** An active event and when its gallery closes, which frees its place. */
export interface ClosingEvent {
  id: string;
  title: string;
  galleryClosesAt: Date;
}

/** What an account holds now, measured the way its limits are. */
export interface AccountUsage {
  /** Events the account created whose galleries are still open. */
  activeEvents: number;
  /** The active event whose gallery closes first; null when none is set to close. */
  nextClosingEvent: ClosingEvent | null;
}

const NO_USAGE: EventUsage = { members: 0, storageBytes: 0n };

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
 * both go through it.
 *
 * An event's limits come from the Plan row it points at, a versioned and
 * immutable catalog, plus `Event.bonusStorageBytes`. Because plan rows never
 * change (a database trigger refuses updates), they are cached by id for the
 * life of the process.
 */
@Injectable()
export class EventPlanService {
  private readonly plansById = new Map<string, Plan>();

  constructor(private readonly prisma: PrismaService) {}

  /** A plan version by id, cached: plan rows never change. */
  async planFor(planId: string): Promise<Plan> {
    const cached = this.plansById.get(planId);
    if (cached) return cached;

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    // The foreign key makes this unreachable; failing loudly beats guessing limits.
    if (!plan) throw new InternalServerErrorException(`Plan ${planId} not found`);
    this.plansById.set(plan.id, plan);
    return plan;
  }

  /**
   * The version of `code` new events get: the highest one. Not cached, since a
   * new version can be inserted at any time.
   */
  async currentPlan(code: EventPlan): Promise<Plan> {
    const plan = await this.prisma.plan.findFirst({ where: { code }, orderBy: { version: "desc" } });
    // The migration seeds FREE version 1; a missing plan is a deploy error.
    if (!plan) throw new InternalServerErrorException(`No version of plan ${code} exists`);
    this.plansById.set(plan.id, plan);
    return plan;
  }

  /** An event's limits: its plan version's terms, with its bonus storage added. */
  async limitsOf(event: PlannedEvent): Promise<EventLimits> {
    const plan = await this.planFor(event.planId);
    return {
      plan: plan.code,
      memberLimit: plan.memberLimit,
      storageLimitBytes: plan.storageLimitBytes === null ? null : plan.storageLimitBytes + event.bonusStorageBytes,
    };
  }

  /** Limits for several events; plans are shared and cached, so this costs at most one query per plan version. */
  async limitsForEvents(events: PlannedEvent[]): Promise<Map<string, EventLimits>> {
    const entries = await Promise.all(events.map(async (event) => [event.id, await this.limitsOf(event)] as const));
    return new Map(entries);
  }

  /** Every account is FREE until a host subscription exists. */
  accountPlanFor(userId: string): Promise<AccountPlan> {
    void userId;
    return Promise.resolve(ACCOUNT_PLANS.FREE);
  }

  /** An account's limits: its plan's terms. */
  async accountLimitsFor(userId: string): Promise<AccountLimits> {
    const plan = await this.accountPlanFor(userId);
    return { plan, ...ACCOUNT_PLAN_LIMITS[plan] };
  }

  /**
   * An account's active events, counted the way the limit counts them, and the
   * one whose gallery closes first: closing frees its place. Two queries.
   */
  async accountUsageFor(userId: string, now: Date = new Date()): Promise<AccountUsage> {
    const active = activeEventsCreatedBy(userId, now);
    const [activeEvents, next] = await Promise.all([
      this.prisma.event.count({ where: active }),
      this.prisma.event.findFirst({
        where: { AND: [active, { galleryClosesAt: { not: null } }] },
        orderBy: [{ galleryClosesAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, galleryClosesAt: true },
      }),
    ]);

    return {
      activeEvents,
      nextClosingEvent: next?.galleryClosesAt
        ? { id: next.id, title: next.title, galleryClosesAt: next.galleryClosesAt }
        : null,
    };
  }

  /** Members and gallery storage per event, in two queries whatever the number of events. */
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
        _sum: { sizeBytes: true },
      }),
    ]);

    for (const row of members) usage.get(row.eventId)!.members = row._count._all;
    for (const row of photos) usage.get(row.eventId)!.storageBytes = BigInt(row._sum.sizeBytes ?? 0);
    return usage;
  }

  /**
   * Refuses a new event once the creator has as many active events as their
   * account plan allows. Run it in the transaction that creates the event: the
   * lock makes two creates by the same person count one after the other.
   */
  async assertCanCreateEvent(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const { maxActiveEvents } = await this.accountLimitsFor(userId);
    if (maxActiveEvents === null) return;

    await lockForTransaction(tx, `event-plan:create:${userId}`);
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
    const { memberLimit } = await this.limitsOf(event);
    if (memberLimit === null) return;

    await lockForTransaction(tx, `event-plan:members:${event.id}`);
    const members = await tx.eventAccess.count({ where: { eventId: event.id } });
    if (members < memberLimit) return;

    throw new ForbiddenException({
      code: PLAN_LIMIT_CODES.EVENT_MEMBER_LIMIT_REACHED,
      message: PLAN_LIMIT_MESSAGES.EVENT_MEMBER_LIMIT_REACHED(memberLimit),
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
   * Refuses a batch that would take the gallery past its storage limit. Run
   * it inside the upload reservation's Serializable transaction, so two
   * batches for the same gallery cannot both slip under the limit.
   */
  async assertGalleryHasRoom(tx: Prisma.TransactionClient, event: PlannedEvent, requestedBytes: bigint): Promise<void> {
    const { storageLimitBytes } = await this.limitsOf(event);
    if (storageLimitBytes === null) return;

    const held = await tx.photo.aggregate({
      where: { eventId: event.id, status: { in: GALLERY_PHOTO_STATUSES } },
      _sum: { sizeBytes: true },
    });
    const bytes = BigInt(held._sum.sizeBytes ?? 0);
    if (bytes + requestedBytes <= storageLimitBytes) return;

    throw new ForbiddenException({
      code: PLAN_LIMIT_CODES.EVENT_STORAGE_LIMIT_REACHED,
      message: PLAN_LIMIT_MESSAGES.EVENT_STORAGE_LIMIT_REACHED,
    });
  }
}
