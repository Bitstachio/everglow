import { NotFoundException } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "../evidence/evidence.service";
import { buildEvidenceServiceMock, EvidenceServiceMock } from "../evidence/testing/evidence-service.mock";
import { PlatformEnforcementService } from "./platform-enforcement.service";

describe("PlatformEnforcementService", () => {
  const eventId = "66666666-6666-6666-6666-666666666666";
  const userId = "44444444-4444-4444-4444-444444444444";
  const moderatorId = "99999999-9999-9999-9999-999999999999";

  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { deleteObject: jest.Mock };
  let evidence: EvidenceServiceMock;
  let purge: { purgeObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock };
  let service: PlatformEnforcementService;

  const closure = (status: string, closedReason: string) => ({
    status,
    closedReason,
    closedByRole: "PLATFORM",
    resolvedById: moderatorId,
    resolvedAt: expect.any(Date) as unknown,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.report.updateMany.mockResolvedValue({ count: 2 });
    prisma.event.findUnique.mockResolvedValue({ id: eventId, suspendedAt: null, coverS3Key: null } as never);
    s3Service = { deleteObject: jest.fn().mockResolvedValue(undefined) };
    evidence = buildEvidenceServiceMock();
    purge = { purgeObjects: jest.fn().mockResolvedValue({ requested: 0, deleted: 0, failed: 0, retained: 0 }) };
    logger = { setContext: jest.fn(), info: jest.fn() };
    service = new PlatformEnforcementService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
      evidence as unknown as EvidenceService,
      purge as unknown as PhotoPurgeService,
      logger as unknown as PinoLogger,
    );
  });

  describe("suspendEvent", () => {
    it("suspends the event and closes its reports about the event itself as EVENT_SUSPENDED", async () => {
      await service.suspendEvent(eventId, moderatorId);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { suspendedAt: expect.any(Date) as unknown },
      });
      expect(prisma.report.updateMany).toHaveBeenCalledWith({
        where: { eventId, targetType: "EVENT", status: "OPEN" },
        data: closure("ACTIONED", "EVENT_SUSPENDED"),
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.suspended", eventId, moderatorId, closedReports: 2, audit: true }),
        expect.any(String),
      );
    });

    it("is idempotent for an event already suspended", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: eventId, suspendedAt: new Date(), coverS3Key: null } as never);

      await service.suspendEvent(eventId, moderatorId);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("answers 404 for an event that doesn't exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.suspendEvent(eventId, moderatorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("restores an event: lifts the suspension and the review, and dismisses its event reports", async () => {
    await service.restoreEvent(eventId, moderatorId);

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: eventId },
      data: { suspendedAt: null, underReviewAt: null },
    });
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { eventId, targetType: "EVENT", status: "OPEN" },
      data: closure("DISMISSED", "DISMISSED"),
    });
  });

  it("edits only the fields it is given", async () => {
    await service.editEvent(eventId, moderatorId, { description: null });

    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { description: null } });
  });

  describe("removeCover", () => {
    const coverS3Key = `event-covers/${eventId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;

    it("copies the cover to evidence first, then deletes it and clears the column", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: eventId, suspendedAt: null, coverS3Key } as never);

      await service.removeCover(eventId, moderatorId);

      expect(evidence.preserveBeforeDelete).toHaveBeenCalledWith([coverS3Key]);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(coverS3Key);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: eventId, coverS3Key },
        data: { coverS3Key: null, coverUpdatedById: null },
      });
    });

    it("keeps the object when its evidence copy fails, and clears the column all the same", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: eventId, suspendedAt: null, coverS3Key } as never);
      evidence.preserveBeforeDelete.mockResolvedValue({ deletable: [], retained: [coverS3Key] });

      await service.removeCover(eventId, moderatorId);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.event.updateMany).toHaveBeenCalled();
    });
  });

  it("deletes an event whatever its state, closing its OPEN reports first, then purges its objects", async () => {
    prisma.photo.findMany.mockResolvedValue([{ s3Key: "photos/a" }] as never);
    prisma.event.delete.mockResolvedValue({ coverS3Key: "event-covers/c" } as never);

    await service.deleteEvent(eventId, moderatorId);

    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { eventId, status: "OPEN" },
      data: closure("ACTIONED", "EVENT_DELETED"),
    });
    expect(prisma.report.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.event.delete.mock.invocationCallOrder[0],
    );
    expect(purge.purgeObjects).toHaveBeenCalledWith(["photos/a", "event-covers/c"], {
      event: "event.photos.purged",
      eventId,
      moderatorId,
    });
  });

  describe("suspendUser", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ suspendedAt: null } as never);
      prisma.eventAccess.findMany.mockResolvedValue([
        { eventId: "alone", event: { _count: { eventAccesses: 1 } } },
        { eventId: "shared", event: { _count: { eventAccesses: 2 } } },
      ] as never);
      prisma.event.updateMany.mockResolvedValue({ count: 1 });
    });

    it("suspends the account, closes its reports and suspends the events it organizes alone", async () => {
      await service.suspendUser(userId, moderatorId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { suspendedAt: expect.any(Date) as unknown },
      });
      expect(prisma.report.updateMany).toHaveBeenCalledWith({
        where: { reportedUserId: userId, status: "OPEN" },
        data: closure("ACTIONED", "ACCOUNT_SUSPENDED"),
      });
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["alone"] }, suspendedAt: null },
        data: { suspendedAt: expect.any(Date) as unknown },
      });
    });

    it("is idempotent for an account already suspended", async () => {
      prisma.user.findUnique.mockResolvedValue({ suspendedAt: new Date() } as never);

      await service.suspendUser(userId, moderatorId);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("answers 404 for an account that doesn't exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.suspendUser(userId, moderatorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("lifts an account's suspension, leaving its events to be restored one by one", async () => {
    prisma.user.findUnique.mockResolvedValue({ suspendedAt: new Date() } as never);

    await service.unsuspendUser(userId, moderatorId);

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { suspendedAt: null } });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });
});
