import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { closeReportsOnDeletedEvent, closeReportsOnDeletedPhotos } from "./report-closure";

describe("report closure", () => {
  const closedById = "11111111-1111-1111-1111-111111111111";
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
  });

  describe("closeReportsOnDeletedPhotos", () => {
    const photoIds = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"];

    it("closes every OPEN report on the photos as ACTIONED, with the reason, and returns how many", async () => {
      prisma.report.updateMany.mockResolvedValue({ count: 3 });

      await expect(
        closeReportsOnDeletedPhotos(prisma, photoIds, closedById, "PHOTO_DELETED_BY_UPLOADER"),
      ).resolves.toBe(3);

      expect(prisma.report.updateMany).toHaveBeenCalledWith({
        where: { photoId: { in: photoIds }, status: "OPEN" },
        data: {
          status: "ACTIONED",
          closedReason: "PHOTO_DELETED_BY_UPLOADER",
          resolvedById: closedById,
          resolvedAt: expect.any(Date) as unknown,
        },
      });
    });

    it("asks the database nothing when no photo is deleted", async () => {
      await expect(closeReportsOnDeletedPhotos(prisma, [], closedById, "ACCOUNT_DELETED")).resolves.toBe(0);

      expect(prisma.report.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("closeReportsOnDeletedEvent", () => {
    const eventId = "66666666-6666-6666-6666-666666666666";

    it("closes every OPEN report in the event as EVENT_DELETED and deletes none", async () => {
      prisma.report.updateMany.mockResolvedValue({ count: 2 });

      await expect(closeReportsOnDeletedEvent(prisma, eventId, closedById)).resolves.toBe(2);

      expect(prisma.report.updateMany).toHaveBeenCalledWith({
        where: { eventId, status: "OPEN" },
        data: {
          status: "ACTIONED",
          closedReason: "EVENT_DELETED",
          resolvedById: closedById,
          resolvedAt: expect.any(Date) as unknown,
        },
      });
      expect(prisma.report.deleteMany).not.toHaveBeenCalled();
    });
  });
});
