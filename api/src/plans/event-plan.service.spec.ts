import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { ApiException } from "src/common/errors/api.exception";
import { Test } from "@nestjs/testing";
import { Plan, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { activeEventsCreatedBy, EventPlanService, PlannedEvent } from "./event-plan.service";

describe("EventPlanService", () => {
  let service: EventPlanService;
  let prisma: DeepMockProxy<PrismaClient>;

  const GIB = 1024n ** 3n;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const freeV1: Plan = {
    id: "f0000000-0000-4000-8000-000000000001",
    code: "FREE",
    version: 1,
    memberLimit: 30,
    storageLimitBytes: 3n * GIB,
    galleryWindowDays: 30,
    galleryWindowOptions: [],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  };
  const freeV2: Plan = {
    ...freeV1,
    id: "f0000000-0000-4000-8000-000000000002",
    version: 2,
    galleryWindowOptions: [3, 7, 14, 30],
  };
  /** An open gallery: opened a day ago, closes in a day. */
  const event: PlannedEvent = {
    id: "66666666-6666-6666-6666-666666666666",
    planId: freeV1.id,
    bonusStorageBytes: 0n,
    galleryOpensAt: new Date(Date.now() - DAY_MS),
    galleryClosesAt: new Date(Date.now() + DAY_MS),
    galleryClosedAt: null,
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.plan.findUnique.mockResolvedValue(freeV1);
    const moduleRef = await Test.createTestingModule({
      providers: [EventPlanService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(EventPlanService);
  });

  describe("plans", () => {
    it("reads a plan version once and caches it, since plan rows never change", async () => {
      await expect(service.planFor(freeV1.id)).resolves.toEqual(freeV1);
      await service.planFor(freeV1.id);

      expect(prisma.plan.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.plan.findUnique).toHaveBeenCalledWith({ where: { id: freeV1.id } });
    });

    it("fails loudly rather than guessing limits when a plan is missing", async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(service.planFor("missing")).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("gives new events the newest version of a plan, looked up each time", async () => {
      const freeV2 = { ...freeV1, id: "f0000000-0000-4000-8000-000000000002", version: 2, storageLimitBytes: 5n * GIB };
      prisma.plan.findFirst.mockResolvedValueOnce(freeV1).mockResolvedValueOnce(freeV2);

      await expect(service.currentPlan("FREE")).resolves.toEqual(freeV1);
      await expect(service.currentPlan("FREE")).resolves.toEqual(freeV2);
      expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { code: "FREE" }, orderBy: { version: "desc" } });
    });

    it("fails loudly when no version of a plan exists", async () => {
      prisma.plan.findFirst.mockResolvedValue(null);

      await expect(service.currentPlan("FREE")).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe("limitsOf", () => {
    it("takes the event's limits from its plan version", async () => {
      await expect(service.limitsOf(event)).resolves.toEqual({
        plan: "FREE",
        memberLimit: 30,
        storageLimitBytes: 3n * GIB,
        galleryWindowOptions: [30],
      });
    });

    it("adds storage given to this one event on top of its plan", async () => {
      await expect(service.limitsOf({ ...event, bonusStorageBytes: 5n * GIB })).resolves.toMatchObject({
        storageLimitBytes: 8n * GIB,
      });
    });

    it("keeps no limit as no limit, whatever the bonus", async () => {
      prisma.plan.findUnique.mockResolvedValue({ ...freeV1, memberLimit: null, storageLimitBytes: null });

      await expect(service.limitsOf({ ...event, bonusStorageBytes: GIB })).resolves.toMatchObject({
        memberLimit: null,
        storageLimitBytes: null,
      });
    });

    it("keeps an event on the version it points at when a newer one exists", async () => {
      const oldVersionEvent = { ...event, planId: freeV1.id };
      prisma.plan.findFirst.mockResolvedValue({ ...freeV1, id: "v2", version: 2, storageLimitBytes: 5n * GIB });

      await service.currentPlan("FREE");

      await expect(service.limitsOf(oldVersionEvent)).resolves.toMatchObject({ storageLimitBytes: 3n * GIB });
    });
  });

  describe("gallery lengths", () => {
    it("offers a version's options shortest first", () => {
      expect(service.galleryWindowOptions({ ...freeV2, galleryWindowOptions: [30, 3, 14, 7] })).toEqual([3, 7, 14, 30]);
    });

    it("offers a version without options its one length", () => {
      expect(service.galleryWindowOptions(freeV1)).toEqual([30]);
    });

    it("offers no length on a plan that never closes", () => {
      expect(service.galleryWindowOptions({ ...freeV1, galleryWindowDays: null })).toEqual([]);
    });

    it("gives the plan's longest when no length is asked for", () => {
      expect(service.resolveGalleryWindow(freeV2)).toBe(30);
    });

    it.each([3, 7, 14, 30])("takes %p days, one of the plan's options", (days) => {
      expect(service.resolveGalleryWindow(freeV2, days)).toBe(days);
    });

    it("refuses a length the plan doesn't offer", () => {
      expect(() => service.resolveGalleryWindow(freeV2, 10)).toThrow(new BadRequestException());
    });

    it("holds an event on a version without options to its one length", () => {
      expect(service.resolveGalleryWindow(freeV1, 30)).toBe(30);
      expect(() => service.resolveGalleryWindow(freeV1, 7)).toThrow(BadRequestException);
    });

    it("gives no length on a plan that never closes, and refuses one asked for", () => {
      const neverCloses = { ...freeV1, galleryWindowDays: null };

      expect(service.resolveGalleryWindow(neverCloses)).toBeNull();
      expect(() => service.resolveGalleryWindow(neverCloses, 30)).toThrow(BadRequestException);
    });
  });

  describe("new events", () => {
    const userId = "11111111-1111-1111-1111-111111111111";

    it("puts a new event on the free plan's newest version", async () => {
      prisma.plan.findFirst.mockResolvedValue(freeV2);

      await expect(service.newEventPlan(userId)).resolves.toEqual(freeV2);
      expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { code: "FREE" }, orderBy: { version: "desc" } });
    });

    it("tells the create form the lengths, the default and the latest date", async () => {
      prisma.plan.findFirst.mockResolvedValue(freeV2);

      await expect(service.newEventTermsFor(userId, new Date("2026-10-01T12:00:00.000Z"))).resolves.toEqual({
        plan: "FREE",
        galleryWindowOptions: [3, 7, 14, 30],
        defaultGalleryWindowDays: 30,
        latestDate: new Date("2027-10-01T12:00:00.000Z"),
      });
    });
  });

  describe("gallery state", () => {
    const upcoming = { ...event, galleryOpensAt: new Date(Date.now() + DAY_MS) };
    const pastCloseTime = { ...event, galleryClosesAt: new Date(Date.now() - 60 * 1000) };
    const closedByTheJob = { ...event, galleryClosedAt: new Date() };

    /** The code a check refused the event with, or null when it let it through. */
    const refusalOf = (check: () => void): string | null => {
      try {
        check();
        return null;
      } catch (error) {
        expect(error).toBeInstanceOf(ApiException);
        return ((error as ApiException).getResponse() as { code: string }).code;
      }
    };

    it("takes photos while the gallery is open", () => {
      expect(refusalOf(() => service.assertGalleryOpen(event))).toBeNull();
    });

    it("refuses photos before the gallery opens", () => {
      expect(refusalOf(() => service.assertGalleryOpen(upcoming))).toBe("EVENT_GALLERY_NOT_OPEN");
    });

    it.each([
      ["its close time has passed", pastCloseTime],
      ["the close job has run", closedByTheJob],
    ])("refuses photos once %s", (_, closed) => {
      expect(refusalOf(() => service.assertGalleryOpen(closed))).toBe("EVENT_GALLERY_CLOSED");
    });

    it("lets people join an upcoming or open event, but not a closed one", () => {
      expect(refusalOf(() => service.assertGalleryNotClosed(upcoming))).toBeNull();
      expect(refusalOf(() => service.assertGalleryNotClosed(event))).toBeNull();
      expect(refusalOf(() => service.assertGalleryNotClosed(pastCloseTime))).toBe("EVENT_GALLERY_CLOSED");
    });
  });

  describe("accounts", () => {
    const userId = "11111111-1111-1111-1111-111111111111";

    it("gives every account the free account limits until a subscription exists", async () => {
      await expect(service.accountLimitsFor(userId)).resolves.toEqual({ plan: "FREE", maxActiveEvents: 2 });
    });

    it("counts every event the account created that hasn't closed, upcoming ones included", () => {
      const now = new Date("2026-10-01T12:00:00.000Z");

      // No condition on galleryOpensAt: an event counts from the moment it is created.
      expect(activeEventsCreatedBy(userId, now)).toEqual({
        creatorId: userId,
        galleryClosedAt: null,
        OR: [{ galleryClosesAt: null }, { galleryClosesAt: { gt: now } }],
      });
    });

    it("counts the account's active events, and finds the one that closes first", async () => {
      const now = new Date("2026-10-01T12:00:00.000Z");
      const closesAt = new Date("2026-10-20T18:00:00.000Z");
      prisma.event.count.mockResolvedValue(2);
      prisma.event.findFirst.mockResolvedValue({
        id: event.id,
        title: "Book Club",
        galleryClosesAt: closesAt,
      } as never);

      await expect(service.accountUsageFor(userId, now)).resolves.toEqual({
        activeEvents: 2,
        nextClosingEvent: { id: event.id, title: "Book Club", galleryClosesAt: closesAt },
      });
      expect(prisma.event.count).toHaveBeenCalledWith({ where: activeEventsCreatedBy(userId, now) });
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { AND: [activeEventsCreatedBy(userId, now), { galleryClosesAt: { not: null } }] },
        orderBy: [{ galleryClosesAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, galleryClosesAt: true },
      });
    });

    it("has no event to close next when none of the active ones is set to close", async () => {
      prisma.event.count.mockResolvedValue(0);
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(service.accountUsageFor(userId)).resolves.toEqual({ activeEvents: 0, nextClosingEvent: null });
    });

    describe("assertCanCreateEvent", () => {
      it("refuses an event past the account's active-event limit", async () => {
        prisma.event.count.mockResolvedValue(2);

        await expect(service.assertCanCreateEvent(prisma, userId)).rejects.toMatchObject({
          response: { code: "ACTIVE_EVENT_LIMIT_REACHED" },
        });
      });

      it("lets an account under its limit create one, counting under the creator's lock", async () => {
        prisma.event.count.mockResolvedValue(1);

        await expect(service.assertCanCreateEvent(prisma, userId)).resolves.toBeUndefined();
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      });

      it("never counts events on an account plan without a limit", async () => {
        jest.spyOn(service, "accountLimitsFor").mockResolvedValue({ plan: "FREE", maxActiveEvents: null });

        await expect(service.assertCanCreateEvent(prisma, userId)).resolves.toBeUndefined();
        expect(prisma.event.count).not.toHaveBeenCalled();
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
      });
    });
  });

  describe("usageFor", () => {
    it("counts members and the storage of in-flight or ready photos per event in two queries, zero for events with none", async () => {
      prisma.eventAccess.groupBy.mockResolvedValue([{ eventId: "a", _count: { _all: 3 } }] as never);
      prisma.photo.groupBy.mockResolvedValue([{ eventId: "a", _sum: { sizeBytes: 7340032 } }] as never);

      const usage = await service.usageFor(["a", "b"]);

      expect(usage.get("a")).toEqual({ members: 3, storageBytes: 7340032n });
      expect(usage.get("b")).toEqual({ members: 0, storageBytes: 0n });
      expect(prisma.photo.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: { in: ["a", "b"] }, status: { in: ["PENDING", "READY"] } } }),
      );
    });

    it("asks the database nothing for no events", async () => {
      await expect(service.usageFor([])).resolves.toEqual(new Map());
      expect(prisma.eventAccess.groupBy).not.toHaveBeenCalled();
    });
  });

  describe("assertCanJoin", () => {
    it("refuses a member past the plan version's limit", async () => {
      prisma.eventAccess.count.mockResolvedValue(30);

      await expect(service.assertCanJoin(prisma, event)).rejects.toBeInstanceOf(ApiException);
    });

    it("never counts members on a plan without a member limit", async () => {
      prisma.plan.findUnique.mockResolvedValue({ ...freeV1, memberLimit: null });

      await expect(service.assertCanJoin(prisma, event)).resolves.toBeUndefined();
      expect(prisma.eventAccess.count).not.toHaveBeenCalled();
    });
  });
});
