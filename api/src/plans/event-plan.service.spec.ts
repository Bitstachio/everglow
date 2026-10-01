import { Test } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { EventPlanService } from "./event-plan.service";

describe("EventPlanService", () => {
  let service: EventPlanService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    const moduleRef = await Test.createTestingModule({
      providers: [EventPlanService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(EventPlanService);
  });

  it("gives every account the free account limits until a subscription exists", async () => {
    await expect(service.accountLimitsFor("user-1")).resolves.toEqual({ maxActiveEvents: 2 });
  });

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
