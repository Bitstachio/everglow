import { Injectable } from "@nestjs/common";
import { EventPlan, PhotoStatus } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import {
  ACCOUNT_PLAN_LIMITS,
  ACCOUNT_PLANS,
  AccountPlan,
  AccountPlanLimits,
  EVENT_PLAN_LIMITS,
  EventPlanLimits,
} from "./plans.constants";

/** What an event holds now, measured the way its limits are. */
export interface EventUsage {
  members: number;
  photos: number;
}

const NO_USAGE: EventUsage = { members: 0, photos: 0 };

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
        where: { eventId: { in: eventIds }, status: { in: [PhotoStatus.PENDING, PhotoStatus.READY] } },
        _count: { _all: true },
      }),
    ]);

    for (const row of members) usage.get(row.eventId)!.members = row._count._all;
    for (const row of photos) usage.get(row.eventId)!.photos = row._count._all;
    return usage;
  }
}
