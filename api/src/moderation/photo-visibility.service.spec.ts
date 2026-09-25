import { Test, TestingModule } from "@nestjs/testing";
import { AccessLevel, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { EventForPhotoVisibility } from "./moderation.types";
import { PhotoVisibilityService } from "./photo-visibility.service";

// Prisma is mocked (docs/testing.md), so this spec pins the rules the filter is
// built from, not the rows the compiled SQL returns.
describe("PhotoVisibilityService", () => {
  let service: PhotoVisibilityService;
  let prisma: DeepMockProxy<PrismaClient>;

  const callerId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const eventFor = (accessLevel: AccessLevel | null, memberCount = 10): EventForPhotoVisibility => ({
    id: eventId,
    title: "Summer BBQ",
    description: null,
    date: now,
    creatorId: null,
    coverS3Key: null,
    invitationUrl: "invite-token",
    createdAt: now,
    updatedAt: now,
    eventAccesses: accessLevel
      ? [
          {
            id: "44444444-4444-4444-4444-444444444444",
            userId: callerId,
            eventId,
            accessLevel,
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [],
    _count: { eventAccesses: memberCount },
  });

  const mockPhotosOverThreshold = (photoIds: string[]) =>
    prisma.report.groupBy.mockResolvedValue(photoIds.map((id) => ({ photoId: id })) as never);

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PhotoVisibilityService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PhotoVisibilityService);
  });

  describe("whereVisibleTo", () => {
    it("filters nothing for an organizer of the event, and asks the database nothing", async () => {
      const where = await service.whereVisibleTo(callerId, eventFor(AccessLevel.ORGANIZER));

      expect(where).toEqual({});
      expect(prisma.report.groupBy).not.toHaveBeenCalled();
    });

    it.each([AccessLevel.PARTICIPANT, AccessLevel.VIEWER])("applies every filter to a %s", async (accessLevel) => {
      mockPhotosOverThreshold([]);

      const where = await service.whereVisibleTo(callerId, eventFor(accessLevel));

      expect(where.AND).toHaveLength(4);
    });

    it("hides photos the caller has an OPEN report on, and only OPEN ones", async () => {
      mockPhotosOverThreshold([]);

      const where = await service.whereVisibleTo(callerId, eventFor(AccessLevel.PARTICIPANT));

      expect(where.AND).toContainEqual({ reports: { none: { reporterId: callerId, status: "OPEN" } } });
    });

    it("hides a photo with a single OPEN report for nudity or violence, before any threshold", async () => {
      mockPhotosOverThreshold([]);

      const where = await service.whereVisibleTo(callerId, eventFor(AccessLevel.PARTICIPANT));

      expect(where.AND).toContainEqual({
        reports: { none: { status: "OPEN", reason: { in: ["NUDITY_OR_SEXUAL", "VIOLENCE"] } } },
      });
    });

    it("hides photos whose OPEN reports reached the threshold, found with one grouped query for the event", async () => {
      mockPhotosOverThreshold([photoId]);

      const where = await service.whereVisibleTo(callerId, eventFor(AccessLevel.PARTICIPANT));

      expect(prisma.report.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.report.groupBy).toHaveBeenCalledWith({
        by: ["photoId"],
        where: { eventId, status: "OPEN", photoId: { not: null } },
        having: { photoId: { _count: { gte: 3 } } },
      });
      expect(where.AND).toContainEqual({ id: { notIn: [photoId] } });
    });

    it("lowers the threshold to 2 in an event too small to ever collect 3 reports", async () => {
      mockPhotosOverThreshold([]);

      await service.whereVisibleTo(callerId, eventFor(AccessLevel.PARTICIPANT, 3));

      expect(prisma.report.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ having: { photoId: { _count: { gte: 2 } } } }),
      );
    });

    it("hides photos of uploaders the caller blocked and of uploaders who blocked the caller", async () => {
      mockPhotosOverThreshold([]);

      const where = await service.whereVisibleTo(callerId, eventFor(AccessLevel.PARTICIPANT));

      expect(where.AND).toContainEqual({
        NOT: {
          addedBy: {
            is: {
              OR: [
                { blocksReceived: { some: { blockerId: callerId } } },
                { blocksInitiated: { some: { blockedId: callerId } } },
              ],
            },
          },
        },
      });
    });
  });

  describe("isVisibleTo", () => {
    it("applies the list's filter to the one photo", async () => {
      mockPhotosOverThreshold([]);
      prisma.photo.count.mockResolvedValue(1);
      const event = eventFor(AccessLevel.VIEWER);

      await expect(service.isVisibleTo(photoId, callerId, event)).resolves.toBe(true);
      expect(prisma.photo.count).toHaveBeenCalledWith({
        where: { AND: [{ id: photoId }, await service.whereVisibleTo(callerId, event)] },
      });
    });

    it("is false when the filter excludes the photo", async () => {
      mockPhotosOverThreshold([photoId]);
      prisma.photo.count.mockResolvedValue(0);

      await expect(service.isVisibleTo(photoId, callerId, eventFor(AccessLevel.VIEWER))).resolves.toBe(false);
    });
  });
});
