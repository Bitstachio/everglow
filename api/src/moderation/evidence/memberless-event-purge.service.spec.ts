import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { MemberlessEventPurgeService } from "./memberless-event-purge.service";

describe("MemberlessEventPurgeService", () => {
  const eventId = "66666666-6666-6666-6666-666666666666";
  const photoKey = "photos/u/e/p";
  const coverKey = "event-covers/e/c";

  let prisma: DeepMockProxy<PrismaClient>;
  let photoPurgeService: { purgeObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock };
  let service: MemberlessEventPurgeService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    photoPurgeService = { purgeObjects: jest.fn().mockResolvedValue({}) };
    logger = { setContext: jest.fn(), info: jest.fn() };
    const config = { getOrThrow: jest.fn().mockReturnValue(50) };
    service = new MemberlessEventPurgeService(
      prisma as unknown as PrismaService,
      photoPurgeService as unknown as PhotoPurgeService,
      config as unknown as ConfigService,
      logger as unknown as PinoLogger,
    );
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.event.findMany.mockResolvedValue([{ id: eventId }] as never);
    // lockPendingModeration: not under review, no OPEN report.
    prisma.$queryRaw.mockResolvedValue([{ underReviewAt: null }]);
    prisma.report.count.mockResolvedValue(0);
    prisma.eventAccess.count.mockResolvedValue(0);
    prisma.photo.findMany.mockResolvedValue([{ s3Key: photoKey }] as never);
    prisma.event.findUnique.mockResolvedValue({ coverS3Key: coverKey } as never);
    prisma.event.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("looks only at events with no members", async () => {
    await service.run();

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { eventAccesses: { none: {} } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true },
    });
  });

  it("deletes one with nothing pending, then purges its photos and cover through the normal purge", async () => {
    await expect(service.run()).resolves.toEqual({ memberlessEventsDeleted: 1, memberlessEventsKept: 0 });

    expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { id: eventId } });
    // PhotoPurgeService copies every reported object to evidence before deleting it.
    expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith([photoKey, coverKey], {
      event: "event.photos.purged",
      eventId,
    });
    expect(photoPurgeService.purgeObjects.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.event.deleteMany.mock.invocationCallOrder[0],
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "event.memberless.deleted", eventId, audit: true }),
      expect.any(String),
    );
  });

  it("keeps one with an OPEN report", async () => {
    prisma.report.count.mockResolvedValue(1);

    await expect(service.run()).resolves.toEqual({ memberlessEventsDeleted: 0, memberlessEventsKept: 1 });
    expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
  });

  it("keeps one under review", async () => {
    prisma.$queryRaw.mockResolvedValue([{ underReviewAt: new Date() }]);

    await expect(service.run()).resolves.toEqual({ memberlessEventsDeleted: 0, memberlessEventsKept: 1 });
    expect(prisma.event.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps one somebody joined in the meantime", async () => {
    prisma.eventAccess.count.mockResolvedValue(1);

    await expect(service.run()).resolves.toEqual({ memberlessEventsDeleted: 0, memberlessEventsKept: 1 });
    expect(prisma.event.deleteMany).not.toHaveBeenCalled();
  });
});
