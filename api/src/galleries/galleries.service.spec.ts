import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Event, EventAccess, Gallery, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { UserWithDetails } from "src/users/users.types";
import { GalleriesService } from "./galleries.service";

describe("GalleriesService", () => {
  let service: GalleriesService;
  let prisma: DeepMockProxy<PrismaClient>;
  let logger: {
    setContext: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  const callerId = "11111111-1111-1111-1111-111111111111";
  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const galleryId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const callerWithoutDetails: UserWithDetails = {
    id: callerId,
    providerSub: "auth0|caller",
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const callerWithDetails: UserWithDetails = {
    id: callerId,
    providerSub: "auth0|caller",
    createdAt: now,
    updatedAt: now,
    details: {
      id: "33333333-3333-3333-3333-333333333333",
      userId: callerId,
      email: "caller@example.com",
      name: "Caller",
      createdAt: now,
      updatedAt: now,
    },
  };

  const event: Event = {
    id: eventId,
    title: "Summer BBQ",
    description: null,
    date: new Date("2026-08-15T18:00:00.000Z"),
    creatorId: otherUserId,
    invitationUrl: "invite-token",
    createdAt: now,
    updatedAt: now,
  };

  const callerAccess: EventAccess = {
    id: "44444444-4444-4444-4444-444444444444",
    userId: callerId,
    eventId,
    accessLevel: "VIEWER",
    createdAt: now,
    updatedAt: now,
  };

  const gallery: Gallery = {
    id: galleryId,
    eventId,
    name: "Main",
    createdAt: now,
    updatedAt: now,
  };

  const eventWithCallerAccess = (access: EventAccess[]) => ({ ...event, eventAccesses: access });
  const galleryWithEvent = (access: EventAccess[]) => ({
    ...gallery,
    event: { ...event, eventAccesses: access },
  });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GalleriesService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(GalleriesService);
  });

  describe("findAllForEvent", () => {
    it("throws NotFoundException when the event does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findAllForEvent(eventId, callerId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.gallery.findMany).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller has no access to the event", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess([]));

      await expect(service.findAllForEvent(eventId, callerId)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.gallery.findMany).not.toHaveBeenCalled();
    });

    it("returns the galleries the caller can read when the caller is a member", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess([callerAccess]));
      prisma.gallery.findMany.mockResolvedValue([gallery]);

      const result = await service.findAllForEvent(eventId, callerId);

      expect(result).toEqual([gallery]);
      expect(prisma.gallery.findMany).toHaveBeenCalledTimes(1);
      const findManyArgs = prisma.gallery.findMany.mock.calls[0][0] as Prisma.GalleryFindManyArgs;
      expect(findManyArgs.where).toMatchObject({ AND: expect.arrayContaining([{ eventId }]) });
      expect(findManyArgs.orderBy).toEqual({ createdAt: "asc" });
    });

    it("denies access when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithoutDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess([callerAccess]));

      await expect(service.findAllForEvent(eventId, callerId)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.gallery.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findOne", () => {
    it("throws NotFoundException when the gallery does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(null);

      await expect(service.findOne(galleryId, callerId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ForbiddenException when the caller is not a member of the parent event", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([]) as never);

      await expect(service.findOne(galleryId, callerId)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns the gallery without the event relation when the caller is a member", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess]) as never);

      const result = await service.findOne(galleryId, callerId);

      expect(result).toEqual(gallery);
      expect(result).not.toHaveProperty("event");
    });

    it("denies access when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithoutDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess]) as never);

      await expect(service.findOne(galleryId, callerId)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
