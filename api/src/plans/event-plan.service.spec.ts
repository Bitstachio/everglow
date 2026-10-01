import { ForbiddenException, InternalServerErrorException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Plan, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { EventPlanService, PlannedEvent } from "./event-plan.service";

describe("EventPlanService", () => {
  let service: EventPlanService;
  let prisma: DeepMockProxy<PrismaClient>;

  const GIB = 1024n ** 3n;
  const freeV1: Plan = {
    id: "f0000000-0000-4000-8000-000000000001",
    code: "FREE",
    version: 1,
    memberLimit: 30,
    storageLimitBytes: 3n * GIB,
    galleryWindowDays: 30,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  };
  const event: PlannedEvent = {
    id: "66666666-6666-6666-6666-666666666666",
    planId: freeV1.id,
    bonusStorageBytes: 0n,
    galleryClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

  it("gives every account the free account limits until a subscription exists", async () => {
    await expect(service.accountLimitsFor("user-1")).resolves.toEqual({ maxActiveEvents: 2 });
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

      await expect(service.assertCanJoin(prisma, event)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("never counts members on a plan without a member limit", async () => {
      prisma.plan.findUnique.mockResolvedValue({ ...freeV1, memberLimit: null });

      await expect(service.assertCanJoin(prisma, event)).resolves.toBeUndefined();
      expect(prisma.eventAccess.count).not.toHaveBeenCalled();
    });
  });
});
