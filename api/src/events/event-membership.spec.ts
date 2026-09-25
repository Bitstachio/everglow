import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { removeMemberInTransaction } from "./event-membership";

describe("removeMemberInTransaction", () => {
  const eventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const userId = "22222222-2222-2222-2222-222222222222";
  const removedById = "11111111-1111-1111-1111-111111111111";
  const uploaded = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", s3Key: "photos/a" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", s3Key: "photos/b" },
  ];
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.eventAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.photo.findMany.mockResolvedValue(uploaded as never);
    prisma.photo.deleteMany.mockResolvedValue({ count: uploaded.length });
    prisma.report.updateMany.mockResolvedValue({ count: 3 });
  });

  it("removes the membership and bans them, keeping a repeat ban's first record", async () => {
    await removeMemberInTransaction(prisma, { eventId, userId, removedById, photos: "KEEP" });

    expect(prisma.eventAccess.deleteMany).toHaveBeenCalledWith({ where: { eventId, userId } });
    expect(prisma.eventBan.upsert).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, bannedById: removedById },
      update: {},
    });
  });

  it("leaves their photos alone with KEEP", async () => {
    await expect(removeMemberInTransaction(prisma, { eventId, userId, removedById, photos: "KEEP" })).resolves.toEqual({
      photoKeys: [],
      photosDeleted: 0,
      reportsClosed: 0,
    });

    expect(prisma.photo.findMany).not.toHaveBeenCalled();
    expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
  });

  it("with DELETE, deletes every photo they uploaded to the event after closing its OPEN reports", async () => {
    const result = await removeMemberInTransaction(prisma, {
      eventId,
      userId,
      removedById,
      photos: "DELETE",
      excludePhotoIds: ["cccccccc-cccc-cccc-cccc-cccccccccccc"],
    });

    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { eventId, addedById: userId, id: { notIn: ["cccccccc-cccc-cccc-cccc-cccccccccccc"] } },
      select: { id: true, s3Key: true },
    });
    const ids = uploaded.map((photo) => photo.id);
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { photoId: { in: ids }, status: "OPEN" },
      data: { status: "ACTIONED", resolvedById: removedById, resolvedAt: expect.any(Date) as unknown },
    });
    expect(prisma.report.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.photo.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ids } } });
    expect(result).toEqual({ photoKeys: ["photos/a", "photos/b"], photosDeleted: 2, reportsClosed: 3 });
  });
});
