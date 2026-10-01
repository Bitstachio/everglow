import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { deleteUploadsInTransaction } from "./photo-deletion";

describe("deleteUploadsInTransaction", () => {
  const eventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const userId = "22222222-2222-2222-2222-222222222222";
  const closedById = "11111111-1111-1111-1111-111111111111";
  const uploaded = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", s3Key: "photos/a", sizeBytes: 1_500_000 },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", s3Key: "photos/b", sizeBytes: 2_500_000 },
  ];
  const ids = uploaded.map((photo) => photo.id);
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.photo.findMany.mockResolvedValue(uploaded as never);
    prisma.photo.deleteMany.mockResolvedValue({ count: uploaded.length });
    prisma.report.updateMany.mockResolvedValue({ count: 1 });
  });

  it("deletes all of the user's photos in the event, closing their OPEN reports first", async () => {
    await expect(deleteUploadsInTransaction(prisma, { eventId, userId, closedById })).resolves.toEqual({
      photoKeys: ["photos/a", "photos/b"],
      photosDeleted: 2,
      bytesFreed: 4_000_000n,
      reportsClosed: 1,
    });

    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { eventId, addedById: userId, id: { notIn: [] } },
      select: { id: true, s3Key: true, sizeBytes: true },
    });
    expect(prisma.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { photoId: { in: ids }, status: "OPEN" },
        data: expect.objectContaining({ status: "ACTIONED", resolvedById: closedById }) as unknown,
      }),
    );
    expect(prisma.report.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.photo.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ids } } });
  });

  it("does nothing when there is nothing to delete", async () => {
    prisma.photo.findMany.mockResolvedValue([]);

    await expect(deleteUploadsInTransaction(prisma, { eventId, userId, closedById })).resolves.toEqual({
      photoKeys: [],
      photosDeleted: 0,
      bytesFreed: 0n,
      reportsClosed: 0,
    });
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
    expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
  });
});
