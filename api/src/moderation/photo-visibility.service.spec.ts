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

  const eventFor = (accessLevel: AccessLevel | null): EventForPhotoVisibility => ({
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
  });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PhotoVisibilityService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PhotoVisibilityService);
  });

  describe("whereVisibleTo", () => {
    it("filters nothing for an organizer of the event", () => {
      const where = service.whereVisibleTo(callerId, eventFor(AccessLevel.ORGANIZER));

      expect(where).toEqual({});
    });

    it.each([AccessLevel.PARTICIPANT, AccessLevel.VIEWER])("applies the block filter to a %s", (accessLevel) => {
      const where = service.whereVisibleTo(callerId, eventFor(accessLevel));

      expect(where.AND).toHaveLength(1);
    });

    it("hides photos of uploaders the caller blocked and of uploaders who blocked the caller", () => {
      const where = service.whereVisibleTo(callerId, eventFor(AccessLevel.PARTICIPANT));

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
      prisma.photo.count.mockResolvedValue(1);
      const event = eventFor(AccessLevel.VIEWER);

      await expect(service.isVisibleTo(photoId, callerId, event)).resolves.toBe(true);
      expect(prisma.photo.count).toHaveBeenCalledWith({
        where: { AND: [{ id: photoId }, service.whereVisibleTo(callerId, event)] },
      });
    });

    it("is false when the filter excludes the photo", async () => {
      prisma.photo.count.mockResolvedValue(0);

      await expect(service.isVisibleTo(photoId, callerId, eventFor(AccessLevel.VIEWER))).resolves.toBe(false);
    });
  });
});
