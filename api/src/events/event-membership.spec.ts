import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { removeMemberInTransaction } from "./event-membership";

describe("removeMemberInTransaction", () => {
  const eventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const userId = "22222222-2222-2222-2222-222222222222";
  const removedById = "11111111-1111-1111-1111-111111111111";
  const uploaded = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", s3Key: "photos/a", sizeBytes: 1000 },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", s3Key: "photos/b", sizeBytes: 2000 },
  ];
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.eventAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.photo.findMany.mockResolvedValue(uploaded as never);
    prisma.photo.deleteMany.mockResolvedValue({ count: uploaded.length });
    prisma.report.updateMany.mockResolvedValue({ count: 3 });
    prisma.$queryRaw.mockResolvedValue([]);
    // The first lookup is the severe reports the member filed: none, unless a test says so.
    prisma.report.findMany.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: "r-1",
        photoId: uploaded[0].id,
        queue: "ORGANIZERS",
        reason: "SPAM",
        reporterId: null,
        reportedUserId: userId,
      },
    ] as never);
  });

  it("removes the membership and bans them, keeping a repeat ban's first record", async () => {
    await removeMemberInTransaction(prisma, {
      eventId,
      userId,
      removedById,
      removedByRole: "ORGANIZER",
      photos: "KEEP",
    });

    expect(prisma.eventAccess.deleteMany).toHaveBeenCalledWith({ where: { eventId, userId } });
    expect(prisma.eventBan.upsert).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, bannedById: removedById },
      update: {},
    });
  });

  it("leaves their photos alone with KEEP", async () => {
    await expect(
      removeMemberInTransaction(prisma, { eventId, userId, removedById, removedByRole: "ORGANIZER", photos: "KEEP" }),
    ).resolves.toEqual({
      photoKeys: [],
      photosDeleted: 0,
      reportsClosed: 0,
      reportsEscalated: [],
      filedReportsClosed: 3,
      filedReportsEscalated: [],
    });

    expect(prisma.photo.findMany).not.toHaveBeenCalled();
    expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
  });

  describe("the reports they filed in the event", () => {
    const filed = { eventId, reporterId: userId, status: "OPEN", queue: "ORGANIZERS" };
    const severe = ["NUDITY_OR_SEXUAL", "VIOLENCE", "CHILD_SAFETY", "NON_CONSENSUAL_INTIMATE_IMAGE"];

    it.each(["ORGANIZER", "PLATFORM"] as const)(
      "close as DISMISSED, REPORTER_REMOVED by the %s removing them, so they stop counting",
      async (removedByRole) => {
        await removeMemberInTransaction(prisma, { eventId, userId, removedById, removedByRole, photos: "KEEP" });

        expect(prisma.report.updateMany).toHaveBeenCalledWith({
          where: { ...filed, reason: { notIn: severe } },
          data: {
            status: "DISMISSED",
            closedReason: "REPORTER_REMOVED",
            closedByRole: removedByRole,
            resolvedById: removedById,
            resolvedAt: expect.any(Date) as unknown,
          },
        });
      },
    );

    it("move to the platform instead when severe, still hiding what they report", async () => {
      const moved = {
        id: "r-severe",
        eventId,
        targetType: "PHOTO",
        photoId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        reportedUserId: removedById,
        reason: "VIOLENCE",
      };
      prisma.report.findMany.mockReset().mockResolvedValue([{ id: moved.id }] as never);
      prisma.$queryRaw.mockResolvedValue([moved]);

      const result = await removeMemberInTransaction(prisma, {
        eventId,
        userId,
        removedById,
        removedByRole: "ORGANIZER",
        photos: "KEEP",
      });

      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { ...filed, reason: { in: severe } },
        select: { id: true },
      });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result.filedReportsEscalated).toEqual([moved]);
    });

    it("leave reports already with the platform alone", async () => {
      await removeMemberInTransaction(prisma, {
        eventId,
        userId,
        removedById,
        removedByRole: "ORGANIZER",
        photos: "KEEP",
      });

      for (const [args] of prisma.report.updateMany.mock.calls) {
        expect(args.where).toMatchObject({ queue: "ORGANIZERS", status: "OPEN" });
      }
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  it("with DELETE, deletes every photo they uploaded to the event after closing its OPEN reports", async () => {
    const result = await removeMemberInTransaction(prisma, {
      eventId,
      userId,
      removedById,
      removedByRole: "ORGANIZER",
      photos: "DELETE",
      excludePhotoIds: ["cccccccc-cccc-cccc-cccc-cccccccccccc"],
    });

    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { eventId, addedById: userId, id: { notIn: ["cccccccc-cccc-cccc-cccc-cccccccccccc"] } },
      select: { id: true, s3Key: true, sizeBytes: true },
    });
    const ids = uploaded.map((photo) => photo.id);
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { photoId: { in: ids }, status: "OPEN" } }),
    );
    expect(prisma.report.updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["r-1"] }, status: "OPEN" },
      data: {
        status: "ACTIONED",
        closedReason: "PHOTO_REMOVED",
        closedByRole: "ORGANIZER",
        resolvedById: removedById,
        resolvedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.report.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.photo.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ids } } });
    expect(result).toEqual({
      photoKeys: ["photos/a", "photos/b"],
      photosDeleted: 2,
      reportsClosed: 3,
      reportsEscalated: [],
      filedReportsClosed: 3,
      filedReportsEscalated: [],
    });
  });
});
