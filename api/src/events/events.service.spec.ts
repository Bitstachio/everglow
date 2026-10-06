import { accessibleBy } from "@casl/prisma";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AccessLevel, Event, EventAccess, EventInvite, Plan, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { resolveApiErrorMessage } from "src/common/errors/api-error-codes";
import { ApiException } from "src/common/errors/api.exception";
import { EventPlanService } from "src/plans/event-plan.service";
import { ImageUploadService } from "src/images/image-upload.service";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { UserWithDetails, userWithDetailsInclude } from "src/users/users.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "./events.abilities";
import { EventsService } from "./events.service";
import { eventAccessWithUserInclude, eventWithCallerAccessInclude } from "./events.types";

const buildReadAccessibleWhere = (lookupUserId: string): Prisma.EventWhereInput => {
  const ability = new AbilityFactory(mockDeep<PrismaService>()).createForUser({ id: lookupUserId, isOnboarded: true });
  return accessibleBy(ability, EVENT_ACTIONS.READ).ofType(EVENT_SUBJECT) as Prisma.EventWhereInput;
};

describe("EventsService", () => {
  /** The free plan's current version, as the migrations seed it. */
  const freePlan: Plan = {
    id: "f0000000-0000-4000-8000-000000000001",
    code: "FREE",
    version: 2,
    memberLimit: 30,
    storageLimitBytes: 3n * 1024n ** 3n,
    galleryWindowDays: 30,
    galleryWindowOptions: [3, 7, 14, 30],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  };
  const DAY_MS = 24 * 60 * 60 * 1000;
  /** The clock for creating and rescheduling, which place a gallery from it. */
  const today = new Date("2026-10-01T12:00:00.000Z");

  let service: EventsService;
  let prisma: DeepMockProxy<PrismaClient>;
  let photoPurgeService: { purgeObjects: jest.Mock };
  let imageUploads: { getDownloadUrl: jest.Mock };
  let logger: {
    setContext: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  const creatorId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const createEventDto: CreateEventDto = {
    title: "Summer BBQ",
    date: "2026-08-15T18:00:00.000Z",
  };

  const createEventDtoWithDescription: CreateEventDto = {
    ...createEventDto,
    description: "Bring a dish",
  };

  const userWithoutDetails: UserWithDetails = {
    id: creatorId,
    providerSub,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const userWithDetails: UserWithDetails = {
    id: creatorId,
    providerSub,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId: creatorId,
      username: "jane",
      name: "Jane Doe",
      avatarS3Key: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  const createdEvent: Event = {
    id: "33333333-3333-3333-3333-333333333333",
    title: createEventDto.title,
    description: null,
    date: new Date(createEventDto.date),
    creatorId,
    invitationUrl: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    coverS3Key: null,
    coverUpdatedById: null,
    underReviewAt: null,
    planId: "f0000000-0000-4000-8000-000000000001",
    bonusStorageBytes: 0n,
    galleryWindowDays: null,
    galleryOpensAt: new Date(createEventDto.date),
    galleryClosesAt: null,
    galleryClosedAt: null,
    deactivatedAt: null,
    deactivatedById: null,
    createdAt: now,
    updatedAt: now,
  };

  const userId = creatorId;
  const otherUserId = "55555555-5555-5555-5555-555555555555";

  const eventCreatedByUser: Event = {
    id: "66666666-6666-6666-6666-666666666666",
    title: "Created Event",
    description: null,
    date: new Date("2026-09-15T18:00:00.000Z"),
    creatorId: userId,
    invitationUrl: "invite-created",
    coverS3Key: null,
    coverUpdatedById: null,
    underReviewAt: null,
    planId: "f0000000-0000-4000-8000-000000000001",
    bonusStorageBytes: 0n,
    galleryWindowDays: null,
    galleryOpensAt: new Date("2026-09-15T18:00:00.000Z"),
    galleryClosesAt: null,
    galleryClosedAt: null,
    deactivatedAt: null,
    deactivatedById: null,
    createdAt: now,
    updatedAt: now,
  };

  const eventWithAccessOnly: Event = {
    id: "77777777-7777-7777-7777-777777777777",
    title: "Access Only Event",
    description: null,
    date: new Date("2026-08-01T18:00:00.000Z"),
    creatorId: otherUserId,
    invitationUrl: "invite-access",
    coverS3Key: null,
    coverUpdatedById: null,
    underReviewAt: null,
    planId: "f0000000-0000-4000-8000-000000000001",
    bonusStorageBytes: 0n,
    galleryWindowDays: null,
    galleryOpensAt: new Date("2026-08-01T18:00:00.000Z"),
    galleryClosesAt: null,
    galleryClosedAt: null,
    deactivatedAt: null,
    deactivatedById: null,
    createdAt: now,
    updatedAt: now,
  };

  const otherUserWithDetails: UserWithDetails = {
    id: otherUserId,
    providerSub: "auth0|other",
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      userId: otherUserId,
      username: "other",
      name: "Other User",
      avatarS3Key: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  const targetUserId = "44444444-4444-4444-4444-444444444444";

  const eventId = eventCreatedByUser.id;
  const callerId = userId;
  const invitationUrl = eventCreatedByUser.invitationUrl;
  const invalidUrl = "non-existent-invite";

  const newParticipantAccess: EventAccess = {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    userId: callerId,
    eventId,
    accessLevel: AccessLevel.PARTICIPANT,
    createdAt: now,
    updatedAt: now,
  };

  const participantInvite: EventInvite = {
    id: "d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1",
    eventId,
    token: invitationUrl,
    accessLevel: AccessLevel.PARTICIPANT,
    createdAt: now,
    updatedAt: now,
  };

  const viewerInvite: EventInvite = {
    id: "d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2",
    eventId,
    token: "viewer-invite-token",
    accessLevel: AccessLevel.VIEWER,
    createdAt: now,
    updatedAt: now,
  };

  const organizerInvite: EventInvite = {
    id: "d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3",
    eventId,
    token: "organizer-invite-token",
    accessLevel: AccessLevel.ORGANIZER,
    createdAt: now,
    updatedAt: now,
  };

  const organizerAccess: EventAccess = {
    id: "88888888-8888-8888-8888-888888888888",
    userId: callerId,
    eventId,
    accessLevel: AccessLevel.ORGANIZER,
    createdAt: now,
    updatedAt: now,
  };

  const participantAccess: EventAccess = {
    ...organizerAccess,
    id: "99999999-9999-9999-9999-999999999999",
    accessLevel: AccessLevel.PARTICIPANT,
  };

  const viewerAccess: EventAccess = {
    ...organizerAccess,
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    accessLevel: AccessLevel.VIEWER,
  };

  const targetUserWithDetails: UserWithDetails = {
    id: targetUserId,
    providerSub: "auth0|target",
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      userId: targetUserId,
      username: "target",
      name: "Target User",
      avatarS3Key: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  const targetParticipantAccess: EventAccess = {
    id: "10101010-1010-1010-1010-101010101010",
    userId: targetUserId,
    eventId,
    accessLevel: AccessLevel.PARTICIPANT,
    createdAt: now,
    updatedAt: now,
  };

  const participantWithDetails = {
    userId: targetUserId,
    username: "target",
    name: "Target User",
    accessLevel: AccessLevel.PARTICIPANT,
    avatarUrl: null,
    isBlockedByCaller: false,
  };

  // `blocksReceived` is what the include returns: the caller's block on that user, if any.
  const eventAccessWithUser = (access: EventAccess, user: UserWithDetails, blockedByCaller = false) => ({
    ...access,
    user: { ...user, blocksReceived: blockedByCaller ? [{ id: "b10cb10c-b10c-4b10-8b10-b10cb10cb10c" }] : [] },
  });

  const participantsLookup = (lookupEventId: string, lookupCallerId: string) => ({
    where: { eventId: lookupEventId },
    include: eventAccessWithUserInclude(lookupCallerId),
    orderBy: { createdAt: "asc" as const },
  });

  const creatorOrganizerAccessGrant = {
    eventAccesses: {
      create: {
        userId: creatorId,
        accessLevel: AccessLevel.ORGANIZER,
      },
    },
  };

  /** Participant and Viewer links only: nobody becomes an organizer through a link. */
  const expectParticipantAndViewerInvites = (createData: unknown) => {
    const data = createData as {
      invitationUrl: string;
      invites?: { create?: Array<{ token: string; accessLevel: AccessLevel }> };
    };
    expect(data.invites?.create).toHaveLength(2);
    const invites = data.invites!.create!;
    const byLevel = Object.fromEntries(invites.map((invite) => [invite.accessLevel, invite]));
    expect(byLevel[AccessLevel.PARTICIPANT]?.token).toBe(data.invitationUrl);
    expect(byLevel[AccessLevel.VIEWER]?.token).toEqual(expect.any(String));
    expect(byLevel[AccessLevel.VIEWER]?.token).not.toBe(data.invitationUrl);
    expect(byLevel[AccessLevel.ORGANIZER]).toBeUndefined();
  };

  const eventWithCallerAccess = (event: Event, access: EventAccess[]) => ({
    ...event,
    eventAccesses: access,
  });

  const eventLookup = (lookupEventId: string, lookupCallerId: string) => ({
    where: { id: lookupEventId },
    include: eventWithCallerAccessInclude(lookupCallerId),
  });

  const updateTitleDto: UpdateEventDto = { title: "Updated Title" };
  const updateDateDto: UpdateEventDto = { date: "2026-10-01T18:00:00.000Z" };
  const updateDescriptionDto: UpdateEventDto = { description: "Updated description" };
  const updateAllFieldsDto: UpdateEventDto = {
    title: "Updated Title",
    date: "2026-10-01T18:00:00.000Z",
    description: "Updated description",
  };
  const emptyUpdateDto: UpdateEventDto = {};

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    // No blocks unless a test says otherwise.
    prisma.userBlock.findMany.mockResolvedValue([]);
    // Moderation needs no event unless a test says otherwise.
    prisma.$queryRaw.mockResolvedValue([{ underReviewAt: null }]);
    prisma.report.count.mockResolvedValue(0);
    logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    photoPurgeService = { purgeObjects: jest.fn().mockResolvedValue({ requested: 0, deleted: 0, failed: 0 }) };
    // Mirrors the real service: a URL per key, null for a member without an avatar.
    imageUploads = {
      getDownloadUrl: jest.fn((key: string | null) => Promise.resolve(key ? `https://s3.example/${key}?sig=1` : null)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        AbilityFactory,
        EventPlanService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        { provide: PhotoPurgeService, useValue: photoPurgeService },
        { provide: ImageUploadService, useValue: imageUploads },
        {
          provide: PinoLogger,
          useValue: logger,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);

    prisma.user.findUnique.mockResolvedValue(userWithDetails);
    // Interactive transactions run their callback against the same mock client.
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    // Every event is on the free plan's first version unless a test says otherwise.
    prisma.plan.findUnique.mockResolvedValue(freePlan);
    prisma.plan.findFirst.mockResolvedValue(freePlan);
    prisma.photo.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: today });
      // No active events yet, unless a test says otherwise.
      prisma.event.count.mockResolvedValue(0);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("refuses a third active event with 403 ACTIVE_EVENT_LIMIT_REACHED", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.count.mockResolvedValue(2);

      const failure = await service.create(callerId, createEventDto).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getResponse()).toMatchObject({ code: "ACTIVE_EVENT_LIMIT_REACHED" });
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it("creates the event on the free plan's newest version, with that version's longest gallery by default", async () => {
      const freeV3 = {
        ...freePlan,
        id: "f0000000-0000-4000-8000-000000000003",
        version: 3,
        galleryWindowDays: 45,
        galleryWindowOptions: [15, 45],
      };
      prisma.plan.findFirst.mockResolvedValue(freeV3);
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(callerId, createEventDto);

      expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { code: "FREE" }, orderBy: { version: "desc" } });
      expect(prisma.event.create.mock.calls[0][0].data).toMatchObject({
        planId: freeV3.id,
        galleryWindowDays: 45,
        galleryClosesAt: new Date(today.getTime() + 45 * DAY_MS),
      });
    });

    it("opens the gallery on a future date, for the length the host picked", async () => {
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(callerId, { ...createEventDto, date: "2026-11-14T18:00:00.000Z", galleryWindowDays: 7 });

      expect(prisma.event.create.mock.calls[0][0].data).toMatchObject({
        date: new Date("2026-11-14T18:00:00.000Z"),
        galleryWindowDays: 7,
        galleryOpensAt: new Date("2026-11-14T18:00:00.000Z"),
        galleryClosesAt: new Date("2026-11-21T18:00:00.000Z"),
      });
    });

    it("opens the gallery at once for a past date, so the date never shortens it", async () => {
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(callerId, createEventDto);

      expect(prisma.event.create.mock.calls[0][0].data).toMatchObject({
        date: new Date(createEventDto.date),
        galleryWindowDays: 30,
        galleryOpensAt: today,
        galleryClosesAt: new Date(today.getTime() + 30 * DAY_MS),
      });
    });

    it("refuses a gallery length the plan doesn't offer, creating nothing", async () => {
      await expect(service.create(callerId, { ...createEventDto, galleryWindowDays: 10 })).rejects.toThrow(
        new BadRequestException('galleryWindowDays "10" must be one of 3, 7, 14, 30'),
      );
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it("takes a date up to 12 months ahead, and refuses one further, creating nothing", async () => {
      prisma.event.create.mockResolvedValue(createdEvent);

      await expect(service.create(callerId, { ...createEventDto, date: "2027-10-01T12:00:00.000Z" })).resolves.toEqual(
        createdEvent,
      );
      await expect(service.create(callerId, { ...createEventDto, date: "2027-10-01T12:00:00.001Z" })).rejects.toThrow(
        new BadRequestException('date "2027-10-01T12:00:00.001Z" must be at most 12 months ahead'),
      );
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
    });

    it("allows a second active event", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.count.mockResolvedValue(1);
      prisma.event.create.mockResolvedValue(createdEvent);

      await expect(service.create(callerId, createEventDto)).resolves.toBeDefined();
    });

    it("counts the creator's events that haven't closed, upcoming ones included, under a per-creator lock", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(callerId, createEventDto);

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.event.count).toHaveBeenCalledWith({
        where: {
          creatorId: callerId,
          galleryClosedAt: null,
          OR: [{ galleryClosesAt: null }, { galleryClosesAt: { gt: expect.any(Date) as Date } }],
        },
      });
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.event.create.mock.invocationCallOrder[0],
      );
    });

    it("creates an event when the creator exists and has completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(createdEvent);

      const result = await service.create(creatorId, createEventDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: creatorId },
        include: userWithDetailsInclude,
      });
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      const createPayload = prisma.event.create.mock.calls[0][0];
      expect(createPayload.data).toMatchObject({
        title: createEventDto.title,
        date: new Date(createEventDto.date),
        creatorId,
        ...creatorOrganizerAccessGrant,
      });
      expect(typeof createPayload.data.invitationUrl).toBe("string");
      expect(createPayload.data.invitationUrl).not.toBe("");
      expect(createPayload.data.invitationUrl.length).toBeLessThanOrEqual(100);
      expectParticipantAndViewerInvites(createPayload.data);
      expect(result).toEqual(createdEvent);
      expect(logger.info).toHaveBeenCalledWith(
        {
          event: "event.created",
          eventId: createdEvent.id,
          creatorId,
          galleryWindowDays: 30,
          galleryOpensAt: createdEvent.galleryOpensAt,
        },
        "Event created",
      );
    });

    it("grants the creator organizer access when the event is created", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(creatorId, createEventDto);

      expect(prisma.event.create.mock.calls[0][0].data).toMatchObject(creatorOrganizerAccessGrant);
    });

    it("creates PARTICIPANT and VIEWER invite rows, and no ORGANIZER one, nested under the event", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(creatorId, createEventDto);

      expectParticipantAndViewerInvites(prisma.event.create.mock.calls[0][0].data);
    });

    it("creates an event with a description when description is provided", async () => {
      const eventWithDescription: Event = {
        ...createdEvent,
        description: createEventDtoWithDescription.description!,
      };
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(eventWithDescription);

      const result = await service.create(creatorId, createEventDtoWithDescription);

      expect(prisma.event.create.mock.calls[0][0].data).toMatchObject({
        title: createEventDtoWithDescription.title,
        description: createEventDtoWithDescription.description,
        date: new Date(createEventDtoWithDescription.date),
        creatorId,
      });
      expect(typeof prisma.event.create.mock.calls[0][0].data.invitationUrl).toBe("string");
      expect(result).toEqual(eventWithDescription);
    });

    it("persists null description when description is omitted", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(creatorId, createEventDto);

      const createData = prisma.event.create.mock.calls[0][0].data;
      expect(createData).not.toHaveProperty("description");
      expect(createData.description).toBeUndefined();
    });

    it("accepts a full ISO date string with time", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(creatorId, createEventDto);

      expect(prisma.event.create.mock.calls[0][0].data.date).toEqual(new Date("2026-08-15T18:00:00.000Z"));
    });

    it("accepts a date-only ISO string", async () => {
      const dateOnlyDto: CreateEventDto = {
        ...createEventDto,
        date: "2026-08-15",
      };
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue({
        ...createdEvent,
        date: new Date("2026-08-15"),
      });

      await service.create(creatorId, dateOnlyDto);

      expect(prisma.event.create.mock.calls[0][0].data.date).toEqual(new Date("2026-08-15"));
    });

    it("generates a unique invitation link for each new event", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create
        .mockResolvedValueOnce(createdEvent)
        .mockResolvedValueOnce({ ...createdEvent, id: "44444444-4444-4444-4444-444444444444" });

      await service.create(creatorId, createEventDto);
      await service.create(creatorId, createEventDto);

      const firstCreate = prisma.event.create.mock.calls[0][0].data;
      const secondCreate = prisma.event.create.mock.calls[1][0].data;

      expect(firstCreate.invitationUrl).not.toEqual(secondCreate.invitationUrl);
      expect(firstCreate.invitationUrl.length).toBeLessThanOrEqual(100);
      expect(secondCreate.invitationUrl.length).toBeLessThanOrEqual(100);
      expectParticipantAndViewerInvites(firstCreate);
      expectParticipantAndViewerInvites(secondCreate);
    });

    it("throws when the creator does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.create(creatorId, createEventDto)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("User", "ID", creatorId)),
      );
      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the user has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.create(creatorId, createEventDto)).rejects.toThrow(
        new ApiException("ONBOARDING_INCOMPLETE"),
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: creatorId },
        include: userWithDetailsInclude,
      });
      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when persisting a new event", async () => {
      const prismaError = new Error("Database connection lost");
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockRejectedValue(prismaError);

      await expect(service.create(creatorId, createEventDto)).rejects.toThrow(prismaError);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("findAllForUser", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
    });

    it("returns events the user created", async () => {
      prisma.event.findMany.mockResolvedValue([eventCreatedByUser]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildReadAccessibleWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(result).toEqual([eventCreatedByUser]);
    });

    it("returns events where the user is an organizer", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildReadAccessibleWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(result).toEqual([eventWithAccessOnly]);
    });

    it("returns events where the user is a participant", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildReadAccessibleWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(result).toEqual([eventWithAccessOnly]);
    });

    it("returns events where the user is a viewer", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildReadAccessibleWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(result).toEqual([eventWithAccessOnly]);
    });

    it("returns both events the user created and events they were invited to", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly, eventCreatedByUser]);

      const result = await service.findAllForUser(userId);

      expect(result).toEqual([eventWithAccessOnly, eventCreatedByUser]);
    });

    it("returns an empty array when the user is not involved in any event", async () => {
      prisma.event.findMany.mockResolvedValue([]);

      const result = await service.findAllForUser(userId);

      expect(result).toEqual([]);
    });

    it("does not return duplicate events when the user both created the event and has membership access", async () => {
      prisma.event.findMany.mockResolvedValue([eventCreatedByUser]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildReadAccessibleWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(result).toEqual([eventCreatedByUser]);
      expect(result).toHaveLength(1);
    });

    it("orders results by date ascending", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly, eventCreatedByUser]);

      await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildReadAccessibleWhere(userId),
        orderBy: { date: "asc" },
      });
    });

    it("returns an empty array when the user has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      const result = await service.findAllForUser(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual([]);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when loading all involved events", async () => {
      const prismaError = new Error("Connection refused");
      prisma.event.findMany.mockRejectedValue(prismaError);

      await expect(service.findAllForUser(userId)).rejects.toThrow(prismaError);
    });
  });

  describe("joinByInvitationUrl", () => {
    const inviteFor = (invite: EventInvite, event: Event = eventCreatedByUser): EventInvite => ({
      ...invite,
      eventId: event.id,
      token: invite.token,
    });

    const setupSuccessfulJoin = (
      accessLevel: AccessLevel = AccessLevel.PARTICIPANT,
      event: Event = eventCreatedByUser,
      token: string = invitationUrl,
    ) => {
      const invite: EventInvite = {
        ...participantInvite,
        eventId: event.id,
        token,
        accessLevel,
      };
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(invite);
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.eventAccess.findUnique.mockResolvedValue(null);
      prisma.eventAccess.count.mockResolvedValue(1);
      prisma.eventAccess.create.mockResolvedValue({
        ...newParticipantAccess,
        eventId: event.id,
        accessLevel,
      });
      return invite;
    };

    it("refuses a member past the plan's limit, every role counted, under a per-event lock", async () => {
      setupSuccessfulJoin(AccessLevel.VIEWER);
      prisma.eventAccess.count.mockResolvedValue(30);

      const failure = await service.joinByInvitationUrl(callerId, invitationUrl).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getResponse()).toMatchObject({ code: "EVENT_MEMBER_LIMIT_REACHED" });
      expect(prisma.eventAccess.count).toHaveBeenCalledWith({ where: { eventId } });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("uses the member limit of the plan version the event is on", async () => {
      prisma.plan.findUnique.mockResolvedValue({ ...freePlan, memberLimit: 45 });
      setupSuccessfulJoin();
      prisma.eventAccess.count.mockResolvedValue(40);

      await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(prisma.eventAccess.create).toHaveBeenCalledTimes(1);
    });

    it("lets the 30th member in", async () => {
      setupSuccessfulJoin();
      prisma.eventAccess.count.mockResolvedValue(29);

      await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(prisma.eventAccess.create).toHaveBeenCalledTimes(1);
    });

    it("joins the event when the caller is onboarded and the invitation URL is valid", async () => {
      setupSuccessfulJoin();

      const result = await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: callerId },
        include: userWithDetailsInclude,
      });
      expect(prisma.eventInvite.findUnique).toHaveBeenCalledWith({ where: { token: invitationUrl } });
      expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: eventId } });
      expect(prisma.eventAccess.findUnique).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: callerId, eventId } },
      });
      expect(prisma.eventAccess.create).toHaveBeenCalledWith({
        data: { userId: callerId, eventId, accessLevel: AccessLevel.PARTICIPANT },
      });
      expect(result).toEqual(eventCreatedByUser);
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.joined", eventId, callerId, accessLevel: AccessLevel.PARTICIPANT },
        "User joined event via invitation URL",
      );
    });

    it("grants participant access when joining via a PARTICIPANT invite token", async () => {
      setupSuccessfulJoin(AccessLevel.PARTICIPANT);

      await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(prisma.eventAccess.create.mock.calls[0][0].data.accessLevel).toBe(AccessLevel.PARTICIPANT);
    });

    it("grants viewer access when joining via a VIEWER invite token", async () => {
      setupSuccessfulJoin(AccessLevel.VIEWER, eventCreatedByUser, viewerInvite.token);

      await service.joinByInvitationUrl(callerId, viewerInvite.token);

      expect(prisma.eventInvite.findUnique).toHaveBeenCalledWith({ where: { token: viewerInvite.token } });
      expect(prisma.eventAccess.create).toHaveBeenCalledWith({
        data: { userId: callerId, eventId, accessLevel: AccessLevel.VIEWER },
      });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.joined", eventId, callerId, accessLevel: AccessLevel.VIEWER },
        "User joined event via invitation URL",
      );
    });

    it("treats a leftover ORGANIZER invite token as an unknown link", async () => {
      setupSuccessfulJoin(AccessLevel.ORGANIZER, eventCreatedByUser, organizerInvite.token);

      await expect(service.joinByInvitationUrl(callerId, organizerInvite.token)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "invitation URL", organizerInvite.token)),
      );
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("returns the joined event without event access relations", async () => {
      setupSuccessfulJoin();

      const result = await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(result).toEqual({
        id: eventCreatedByUser.id,
        title: eventCreatedByUser.title,
        description: eventCreatedByUser.description,
        date: eventCreatedByUser.date,
        creatorId: eventCreatedByUser.creatorId,
        invitationUrl: eventCreatedByUser.invitationUrl,
        coverS3Key: null,
        coverUpdatedById: null,
        underReviewAt: null,
        planId: "f0000000-0000-4000-8000-000000000001",
        bonusStorageBytes: 0n,
        galleryWindowDays: null,
        galleryOpensAt: eventCreatedByUser.date,
        galleryClosesAt: null,
        galleryClosedAt: null,
        deactivatedAt: null,
        deactivatedById: null,
        createdAt: eventCreatedByUser.createdAt,
        updatedAt: eventCreatedByUser.updatedAt,
      });
      expect(result).not.toHaveProperty("eventAccesses");
    });

    it("allows a user who is not the creator to join via invitation URL", async () => {
      setupSuccessfulJoin(AccessLevel.PARTICIPANT, eventWithAccessOnly, eventWithAccessOnly.invitationUrl);

      const result = await service.joinByInvitationUrl(callerId, eventWithAccessOnly.invitationUrl);

      expect(prisma.eventAccess.create).toHaveBeenCalledWith({
        data: {
          userId: callerId,
          eventId: eventWithAccessOnly.id,
          accessLevel: AccessLevel.PARTICIPANT,
        },
      });
      expect(result).toEqual(eventWithAccessOnly);
    });

    it("does not mutate event fields when joining", async () => {
      setupSuccessfulJoin();

      await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).toHaveBeenCalled();
    });

    it("checks onboarding before looking up the invitation URL", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(ApiException);

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.eventInvite.findUnique).not.toHaveBeenCalled();
      expect(prisma.event.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new ApiException("ONBOARDING_INCOMPLETE"),
      );

      expect(prisma.eventInvite.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the caller does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("User", "ID", callerId)),
      );

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the invitation URL does not match any invite", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(null);

      await expect(service.joinByInvitationUrl(callerId, invalidUrl)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "invitation URL", invalidUrl)),
      );

      expect(prisma.event.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the invite exists but the event does not", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(inviteFor(participantInvite));
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "invitation URL", invitationUrl)),
      );

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the caller has already joined the event", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(inviteFor(participantInvite));
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(participantAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toMatchObject({
        response: { code: "ALREADY_A_MEMBER" },
      });

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("refuses a member an organizer removed, saying so plainly, before looking at blocks", async () => {
      setupSuccessfulJoin();
      prisma.eventBan.findUnique.mockResolvedValue({ id: "ban-id", eventId, userId: callerId } as never);

      const failure = await service.joinByInvitationUrl(callerId, invitationUrl).catch((e: unknown) => e);

      expect(prisma.eventBan.findUnique).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId, userId: callerId } },
      });
      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getResponse()).toEqual({
        code: "REMOVED_FROM_EVENT",
        message: resolveApiErrorMessage("REMOVED_FROM_EVENT"),
      });
      expect(prisma.userBlock.findMany).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("refuses anyone new once the event's gallery has closed", async () => {
      setupSuccessfulJoin();
      prisma.event.findUnique.mockResolvedValue({
        ...eventCreatedByUser,
        galleryClosesAt: new Date(Date.now() - 60_000),
      });

      const failure = await service.joinByInvitationUrl(callerId, invitationUrl).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getResponse()).toMatchObject({ code: "EVENT_GALLERY_CLOSED" });
      // Before the ban, review and block checks: it applies to everyone.
      expect(prisma.eventBan.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("lets people join an upcoming event, before its gallery opens", async () => {
      const upcoming = { ...eventCreatedByUser, galleryOpensAt: new Date(Date.now() + DAY_MS) };
      setupSuccessfulJoin(AccessLevel.PARTICIPANT, upcoming);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).resolves.toEqual(upcoming);
      expect(prisma.eventAccess.create).toHaveBeenCalledTimes(1);
    });

    it("refuses anyone new while the event is under review", async () => {
      setupSuccessfulJoin();
      prisma.event.findUnique.mockResolvedValue({ ...eventCreatedByUser, underReviewAt: new Date() });

      const failure = await service.joinByInvitationUrl(callerId, invitationUrl).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getResponse()).toEqual({
        code: "EVENT_UNDER_REVIEW",
        message: resolveApiErrorMessage("EVENT_UNDER_REVIEW"),
      });
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("answers with the unknown-link 404 when an organizer of the event blocked the caller", async () => {
      setupSuccessfulJoin();
      prisma.userBlock.findMany.mockResolvedValue([{ blockerId: "organizer-id", blocked: { details: null } }] as never);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "invitation URL", invitationUrl)),
      );
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("tells the caller why when they blocked an organizer of the event", async () => {
      setupSuccessfulJoin();
      prisma.userBlock.findMany.mockResolvedValue([
        { blockerId: callerId, blocked: { details: { name: "Sam" } } },
      ] as never);

      const failure = await service.joinByInvitationUrl(callerId, invitationUrl).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getResponse()).toEqual({
        code: "ORGANIZER_BLOCKED_BY_CALLER",
        message: resolveApiErrorMessage("ORGANIZER_BLOCKED_BY_CALLER", { organizerName: "Sam" }),
      });
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("keeps the organizer's block hidden when the two have blocked each other", async () => {
      setupSuccessfulJoin();
      prisma.userBlock.findMany.mockResolvedValue([
        { blockerId: callerId, blocked: { details: { name: "Sam" } } },
        { blockerId: "organizer-id", blocked: { details: null } },
      ] as never);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("checks blocks only against the event's organizers, in both directions, in one query", async () => {
      setupSuccessfulJoin();

      await service.joinByInvitationUrl(callerId, invitationUrl);

      const organizerOfThisEvent = { eventAccesses: { some: { eventId, accessLevel: AccessLevel.ORGANIZER } } };
      expect(prisma.userBlock.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.userBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { blockedId: callerId, blocker: organizerOfThisEvent },
              { blockerId: callerId, blocked: organizerOfThisEvent },
            ],
          },
        }),
      );
    });

    it("throws when the creator attempts to join via their own invitation link", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(inviteFor(participantInvite));
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(organizerAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toMatchObject({
        response: { code: "ALREADY_A_MEMBER" },
      });

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the caller already has organizer access", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(inviteFor(participantInvite));
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(organizerAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toMatchObject({
        response: { code: "ALREADY_A_MEMBER" },
      });

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("does not upgrade existing viewer access when joining again", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(inviteFor(participantInvite));
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(viewerAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toMatchObject({
        response: { code: "ALREADY_A_MEMBER" },
      });

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when creating event access", async () => {
      setupSuccessfulJoin();
      const prismaError = new Error("Database connection lost");
      prisma.eventAccess.create.mockRejectedValue(prismaError);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(prismaError);

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.joined" }),
        expect.any(String),
      );
    });

    it("allows the caller to read the event via findOne after joining", async () => {
      setupSuccessfulJoin();

      await service.joinByInvitationUrl(callerId, invitationUrl);

      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [newParticipantAccess]));

      const result = await service.findOne(eventId, callerId);

      expect(result).toEqual(eventCreatedByUser);
    });
  });

  describe("findOne", () => {
    it("returns the event when the caller is the creator", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));

      const result = await service.findOne(eventId, callerId);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(result).toEqual(eventCreatedByUser);
      expect(result).not.toHaveProperty("eventAccesses");
    });

    it("returns the event when the caller is the creator without loaded event access rows", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      const result = await service.findOne(eventId, callerId);

      expect(result).toEqual(eventCreatedByUser);
    });

    it("returns the event when the caller is an organizer", async () => {
      const nonCreatorOrganizerAccess: EventAccess = {
        ...organizerAccess,
        userId: callerId,
        eventId: eventWithAccessOnly.id,
      };
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(eventWithAccessOnly, [nonCreatorOrganizerAccess]),
      );

      const result = await service.findOne(eventWithAccessOnly.id, callerId);

      expect(result).toEqual(eventWithAccessOnly);
    });

    it("returns the event when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      const result = await service.findOne(eventId, callerId);

      expect(result).toEqual(eventCreatedByUser);
    });

    it("returns the event when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));

      const result = await service.findOne(eventId, callerId);

      expect(result).toEqual(eventCreatedByUser);
    });

    it("does not include eventAccesses in the returned event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));

      const result = await service.findOne(eventId, callerId);

      expect(result).not.toHaveProperty("eventAccesses");
      expect(result).toEqual(eventCreatedByUser);
    });

    it("returns full event metadata needed for the detail screen", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));

      const result = await service.findOne(eventId, callerId);

      expect(result).toEqual({
        id: eventCreatedByUser.id,
        title: eventCreatedByUser.title,
        description: eventCreatedByUser.description,
        date: eventCreatedByUser.date,
        creatorId: eventCreatedByUser.creatorId,
        invitationUrl: eventCreatedByUser.invitationUrl,
        coverS3Key: null,
        coverUpdatedById: null,
        underReviewAt: null,
        planId: "f0000000-0000-4000-8000-000000000001",
        bonusStorageBytes: 0n,
        galleryWindowDays: null,
        galleryOpensAt: eventCreatedByUser.date,
        galleryClosesAt: null,
        galleryClosedAt: null,
        deactivatedAt: null,
        deactivatedById: null,
        createdAt: eventCreatedByUser.createdAt,
        updatedAt: eventCreatedByUser.updatedAt,
      });
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne(eventId, callerId)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId)),
      );
    });

    it("throws when the caller has no relationship to the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.findOne(eventId, otherUserId)).rejects.toThrow(ForbiddenException);
    });

    it("checks that the event exists before evaluating read access", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne(eventId, callerId)).rejects.toThrow(NotFoundException);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
    });

    it("re-throws unexpected database errors when loading the event", async () => {
      const prismaError = new Error("Database connection lost");
      prisma.event.findUnique.mockRejectedValue(prismaError);

      await expect(service.findOne(eventId, callerId)).rejects.toThrow(prismaError);
    });

    it("allows read but denies update and delete for participants", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.findOne(eventId, callerId)).resolves.toEqual(eventCreatedByUser);

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      await expect(service.delete(eventId, callerId)).rejects.toMatchObject({ response: { code: "ORGANIZER_ONLY" } });
    });
  });

  describe("getUpdatable", () => {
    it("returns the event without its access rows when the caller is an organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));

      await expect(service.getUpdatable(eventId, callerId)).resolves.toEqual(eventCreatedByUser);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
    });

    it("throws 404 when the event does not exist, before evaluating access", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getUpdatable(eventId, callerId)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId)),
      );
    });

    it.each([
      ["a participant", participantAccess],
      ["a viewer", viewerAccess],
    ])("tells %s that only organizers can, naming the action in the reason it logs", async (_label, access) => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [access]));

      await expect(service.getUpdatable(eventId, callerId)).rejects.toMatchObject({
        response: {
          code: "ORGANIZER_ONLY",
          message: resolveApiErrorMessage("ORGANIZER_ONLY", { action: "update", subject: "Event" }),
        },
      });
    });

    it("gives a caller with no access the bare 403, with the denied action as the reason it logs", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.getUpdatable(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(RESPONSE_TEMPLATES.ACCESS_DENIED("update", "Event")),
      );
    });
  });

  describe("update", () => {
    /** Upcoming: its gallery opens on its date, a month from today, for 30 days. */
    const upcomingEvent: Event = {
      ...eventCreatedByUser,
      date: new Date("2026-11-01T18:00:00.000Z"),
      galleryWindowDays: 30,
      galleryOpensAt: new Date("2026-11-01T18:00:00.000Z"),
      galleryClosesAt: new Date("2026-12-01T18:00:00.000Z"),
    };
    /** Open: its gallery opened on its date, two weeks ago, for 30 days. */
    const openEvent: Event = {
      ...eventCreatedByUser,
      galleryWindowDays: 30,
      galleryClosesAt: new Date("2026-10-15T18:00:00.000Z"),
    };
    const asOrganizerOf = (event: Event) =>
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(event, [organizerAccess]));

    beforeEach(() => {
      jest.useFakeTimers({ now: today });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe("while the event is upcoming", () => {
      beforeEach(() => {
        asOrganizerOf(upcomingEvent);
        prisma.event.update.mockResolvedValue(upcomingEvent);
      });

      it("moves the date, and the gallery opens on the new one for the same length", async () => {
        await service.update(eventId, callerId, { date: "2026-11-14T18:00:00.000Z" });

        expect(prisma.event.update).toHaveBeenCalledWith({
          where: { id: eventId },
          data: {
            date: new Date("2026-11-14T18:00:00.000Z"),
            galleryWindowDays: 30,
            galleryOpensAt: new Date("2026-11-14T18:00:00.000Z"),
            galleryClosesAt: new Date("2026-12-14T18:00:00.000Z"),
          },
        });
      });

      it("changes the gallery length to another of its plan's options, keeping the date", async () => {
        await service.update(eventId, callerId, { galleryWindowDays: 7 });

        expect(prisma.event.update).toHaveBeenCalledWith({
          where: { id: eventId },
          data: {
            date: upcomingEvent.date,
            galleryWindowDays: 7,
            galleryOpensAt: upcomingEvent.date,
            galleryClosesAt: new Date("2026-11-08T18:00:00.000Z"),
          },
        });
      });

      it("opens the gallery right away when the new date has passed", async () => {
        await service.update(eventId, callerId, { date: "2026-09-20T18:00:00.000Z" });

        expect(prisma.event.update.mock.calls[0][0].data).toMatchObject({
          date: new Date("2026-09-20T18:00:00.000Z"),
          galleryOpensAt: today,
          galleryClosesAt: new Date(today.getTime() + 30 * DAY_MS),
        });
      });

      it("accepts a date-only ISO string", async () => {
        await service.update(eventId, callerId, { date: "2026-11-14" });

        expect(prisma.event.update.mock.calls[0][0].data).toMatchObject({
          date: new Date("2026-11-14"),
          galleryOpensAt: new Date("2026-11-14"),
          galleryClosesAt: new Date("2026-12-14"),
        });
      });

      it("updates every field it is given together", async () => {
        await service.update(eventId, callerId, updateAllFieldsDto);

        expect(prisma.event.update).toHaveBeenCalledWith({
          where: { id: eventId },
          data: {
            title: updateAllFieldsDto.title,
            description: updateAllFieldsDto.description,
            date: new Date(updateAllFieldsDto.date!),
            galleryWindowDays: 30,
            galleryOpensAt: new Date(updateAllFieldsDto.date!),
            galleryClosesAt: new Date(new Date(updateAllFieldsDto.date!).getTime() + 30 * DAY_MS),
          },
        });
      });

      it("takes a date up to 12 months ahead, and refuses one further", async () => {
        await expect(service.update(eventId, callerId, { date: "2027-10-01T12:00:00.000Z" })).resolves.toBeDefined();
        await expect(service.update(eventId, callerId, { date: "2027-10-01T12:00:00.001Z" })).rejects.toThrow(
          new BadRequestException('date "2027-10-01T12:00:00.001Z" must be at most 12 months ahead'),
        );
        expect(prisma.event.update).toHaveBeenCalledTimes(1);
      });

      it("refuses a length the event's plan doesn't offer", async () => {
        await expect(service.update(eventId, callerId, { galleryWindowDays: 10 })).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.event.update).not.toHaveBeenCalled();
      });

      it("checks the length against the event's own plan version, not the newest", async () => {
        prisma.plan.findUnique.mockResolvedValue({ ...freePlan, version: 1, galleryWindowOptions: [] });

        await expect(service.update(eventId, callerId, { galleryWindowDays: 7 })).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.plan.findUnique).toHaveBeenCalledWith({ where: { id: upcomingEvent.planId } });
        expect(prisma.plan.findFirst).not.toHaveBeenCalled();
      });
    });

    describe("once the gallery has opened", () => {
      beforeEach(() => {
        asOrganizerOf(openEvent);
      });

      it.each<[string, UpdateEventDto]>([
        ["date", { date: "2026-12-01T18:00:00.000Z" }],
        ["gallery length", { galleryWindowDays: 7 }],
      ])("refuses a new %s with 403 EVENT_SCHEDULE_LOCKED", async (_, dto) => {
        const failure = await service.update(eventId, callerId, dto).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(ApiException);
        expect((failure as ApiException).getResponse()).toMatchObject({ code: "EVENT_SCHEDULE_LOCKED" });
        expect(prisma.event.update).not.toHaveBeenCalled();
      });

      it("takes the current date and length as no change, so a form that sends every field still works", async () => {
        prisma.event.update.mockResolvedValue({ ...openEvent, title: "Renamed" });

        await service.update(eventId, callerId, {
          title: "Renamed",
          date: openEvent.date.toISOString(),
          galleryWindowDays: 30,
        });

        expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { title: "Renamed" } });
      });
    });

    describe("once the gallery has closed", () => {
      const closedEvent: Event = { ...openEvent, galleryClosesAt: new Date("2026-09-30T18:00:00.000Z") };

      it("refuses a new date: a closed gallery never reopens", async () => {
        asOrganizerOf(closedEvent);

        const failure = await service
          .update(eventId, callerId, { date: "2026-12-01T18:00:00.000Z" })
          .catch((e: unknown) => e);

        expect((failure as ApiException).getResponse()).toMatchObject({ code: "EVENT_SCHEDULE_LOCKED" });
        expect(prisma.event.update).not.toHaveBeenCalled();
      });

      it("still lets organizers change the title", async () => {
        asOrganizerOf(closedEvent);
        prisma.event.update.mockResolvedValue({ ...closedEvent, title: "Renamed" });

        await service.update(eventId, callerId, { title: "Renamed" });

        expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { title: "Renamed" } });
      });
    });

    it("updates the event when the caller has organizer access", async () => {
      const updatedEvent: Event = { ...eventCreatedByUser, title: updateTitleDto.title! };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue(updatedEvent);

      const result = await service.update(eventId, callerId, updateTitleDto);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { title: updateTitleDto.title },
      });
      expect(result).toEqual(updatedEvent);
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.updated", eventId, callerId, fields: Object.keys(updateTitleDto) },
        "Event updated",
      );
    });

    it("updates the event when a non-creator organizer edits it", async () => {
      const nonCreatorOrganizerAccess: EventAccess = {
        ...organizerAccess,
        userId: callerId,
        eventId: eventWithAccessOnly.id,
      };
      const updatedEvent: Event = { ...eventWithAccessOnly, title: updateTitleDto.title! };
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(eventWithAccessOnly, [nonCreatorOrganizerAccess]),
      );
      prisma.event.update.mockResolvedValue(updatedEvent);

      const result = await service.update(eventWithAccessOnly.id, callerId, updateTitleDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventWithAccessOnly.id },
        data: { title: updateTitleDto.title },
      });
      expect(result).toEqual(updatedEvent);
    });

    it("updates title when only title is provided", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue({ ...eventCreatedByUser, title: updateTitleDto.title! });

      await service.update(eventId, callerId, updateTitleDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { title: updateTitleDto.title },
      });
      const updateData = prisma.event.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty("date");
      expect(updateData).not.toHaveProperty("description");
    });

    it("updates date when only date is provided", async () => {
      asOrganizerOf(upcomingEvent);
      prisma.event.update.mockResolvedValue({ ...upcomingEvent, date: new Date(updateDateDto.date!) });

      await service.update(eventId, callerId, updateDateDto);

      const updateData = prisma.event.update.mock.calls[0][0].data;
      expect(updateData).toMatchObject({ date: new Date("2026-10-01T18:00:00.000Z") });
      expect(updateData).not.toHaveProperty("title");
      expect(updateData).not.toHaveProperty("description");
    });

    it("updates description when only description is provided", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue({
        ...eventCreatedByUser,
        description: updateDescriptionDto.description!,
      });

      await service.update(eventId, callerId, updateDescriptionDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { description: updateDescriptionDto.description },
      });
      const updateData = prisma.event.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty("title");
      expect(updateData).not.toHaveProperty("date");
    });

    it("sets description when adding it to an event that had none", async () => {
      const firstDescriptionDto: UpdateEventDto = { description: "First description" };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue({
        ...eventCreatedByUser,
        description: firstDescriptionDto.description!,
      });

      await service.update(eventId, callerId, firstDescriptionDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { description: firstDescriptionDto.description },
      });
    });

    it("allows an empty patch for an authorized organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue(eventCreatedByUser);

      const result = await service.update(eventId, callerId, emptyUpdateDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: {},
      });
      expect(result).toEqual(eventCreatedByUser);
    });

    it("does not attempt update when the caller lacks organizer access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });

      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("performs the authorization check even when the dto is empty", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.update(eventId, callerId, emptyUpdateDto)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId)),
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("checks that the event exists before checking access", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(NotFoundException);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when updating an event", async () => {
      const prismaError = new Error("Database connection lost");
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockRejectedValue(prismaError);

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(prismaError);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("deactivate", () => {
    const deactivated: Event = {
      ...eventCreatedByUser,
      galleryClosesAt: today,
      deactivatedAt: today,
      deactivatedById: callerId,
    };

    beforeEach(() => {
      jest.useFakeTimers({ now: today });
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.findUniqueOrThrow.mockResolvedValue(deactivated);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("closes the gallery now and records who did it, only while it hasn't closed", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.deactivate(eventId, callerId)).resolves.toEqual(deactivated);

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: {
          id: eventId,
          galleryClosedAt: null,
          OR: [{ galleryClosesAt: null }, { galleryClosesAt: { gt: today } }],
        },
        data: { galleryClosesAt: today, deactivatedAt: today, deactivatedById: callerId },
      });
      expect(prisma.event.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: eventId } });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.deactivated", eventId, callerId, audit: true },
        "Event deactivated",
      );
    });

    it("deactivates an upcoming event too, which then never opens", async () => {
      const upcoming = { ...eventCreatedByUser, galleryOpensAt: new Date(today.getTime() + 30 * DAY_MS) };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(upcoming, [organizerAccess]));
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      await service.deactivate(eventId, callerId);

      expect(prisma.event.updateMany).toHaveBeenCalledTimes(1);
    });

    it("changes nothing on an event that has already closed, and returns it as it is", async () => {
      const closedOnSchedule = { ...eventCreatedByUser, galleryClosesAt: new Date("2026-09-30T18:00:00.000Z") };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(closedOnSchedule, [organizerAccess]));
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findUniqueOrThrow.mockResolvedValue(closedOnSchedule);

      await expect(service.deactivate(eventId, callerId)).resolves.toEqual(closedOnSchedule);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it.each([
      ["participant", participantAccess],
      ["viewer", viewerAccess],
    ])("refuses a %s, changing nothing", async (_, access) => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [access]));

      await expect(service.deactivate(eventId, callerId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      expect(prisma.event.updateMany).not.toHaveBeenCalled();
    });

    it("throws 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.deactivate(eventId, callerId)).rejects.toThrow(NotFoundException);
      expect(prisma.event.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    /** Deactivated an hour ago, so closed: only a closed event can be deleted. */
    const deactivation = {
      galleryClosesAt: new Date(Date.now() - 60 * 60 * 1000),
      deactivatedAt: new Date(Date.now() - 60 * 60 * 1000),
      deactivatedById: callerId,
    };
    const deactivatedEvent: Event = { ...eventCreatedByUser, ...deactivation };

    it.each<[string, Partial<Event>]>([
      ["upcoming", { galleryOpensAt: new Date(Date.now() + DAY_MS) }],
      ["open", {}],
    ])("refuses an event that is still %s with 403 EVENT_STILL_ACTIVE, deleting nothing", async (_, schedule) => {
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess({ ...eventCreatedByUser, ...schedule }, [organizerAccess]),
      );

      const failure = await service.delete(eventId, callerId).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getResponse()).toMatchObject({ code: "EVENT_STILL_ACTIVE" });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
    });

    it.each<[string, string, () => void]>([
      ["under review", "EVENT_UNDER_REVIEW", () => prisma.$queryRaw.mockResolvedValue([{ underReviewAt: new Date() }])],
      ["with an OPEN report", "EVENT_HAS_OPEN_REPORTS", () => prisma.report.count.mockResolvedValue(2)],
    ])("refuses a closed event %s with 403 %s, deleting and purging nothing", async (_, code, arrange) => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      arrange();

      const failure = await service.delete(eventId, callerId).catch((e: unknown) => e);

      expect((failure as ApiException).getResponse()).toMatchObject({ code });
      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
    });

    it("locks the event and checks its moderation inside the transaction, before deleting", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      prisma.event.delete.mockResolvedValue(eventCreatedByUser);

      await service.delete(eventId, callerId);

      expect(prisma.report.count).toHaveBeenCalledWith({ where: { eventId, status: "OPEN" } });
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.report.count.mock.invocationCallOrder[0],
      );
      expect(prisma.report.count.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.event.delete.mock.invocationCallOrder[0],
      );
    });

    it("deletes an event whose gallery closed on schedule, without it being deactivated", async () => {
      const closedOnSchedule = { ...eventCreatedByUser, galleryClosesAt: new Date(Date.now() - 60_000) };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(closedOnSchedule, [organizerAccess]));
      prisma.event.delete.mockResolvedValue(closedOnSchedule);

      await expect(service.delete(eventId, callerId)).resolves.toBeUndefined();

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
    });

    it("deletes the event when the caller has organizer access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      prisma.event.delete.mockResolvedValue(eventCreatedByUser);

      await expect(service.delete(eventId, callerId)).resolves.toBeUndefined();

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.deleted", eventId, callerId, photoCount: 0, audit: true },
        "Event deleted",
      );
    });

    it("reads the photo keys and deletes the event in one transaction, then purges the objects", async () => {
      const s3Keys = [`photos/${callerId}/${eventId}/a`, `photos/${callerId}/${eventId}/b`];
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      prisma.photo.findMany.mockResolvedValue(s3Keys.map((s3Key) => ({ s3Key })) as never);
      prisma.event.delete.mockResolvedValue(eventCreatedByUser);

      await service.delete(eventId, callerId);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.photo.findMany).toHaveBeenCalledWith({ where: { eventId }, select: { s3Key: true } });
      // Keys are read before the cascade wipes the rows, and the purge runs after the transaction resolved.
      expect(prisma.photo.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.event.delete.mock.invocationCallOrder[0],
      );
      expect(prisma.event.delete.mock.invocationCallOrder[0]).toBeLessThan(
        photoPurgeService.purgeObjects.mock.invocationCallOrder[0],
      );
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith(s3Keys, {
        event: "event.photos.purged",
        eventId,
        callerId,
      });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.deleted", eventId, callerId, photoCount: 2, audit: true },
        "Event deleted",
      );
    });

    it("purges the cover object with the photos, taking its key from the row the delete returned", async () => {
      const photoKey = `photos/${callerId}/${eventId}/a`;
      const coverS3Key = `event-covers/${eventId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
      // The authorization read saw no cover; one was confirmed before the delete ran.
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      prisma.photo.findMany.mockResolvedValue([{ s3Key: photoKey }] as never);
      prisma.event.delete.mockResolvedValue({ ...eventCreatedByUser, coverS3Key });

      await service.delete(eventId, callerId);

      expect(photoPurgeService.purgeObjects).toHaveBeenCalledTimes(1);
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith([photoKey, coverS3Key], {
        event: "event.photos.purged",
        eventId,
        callerId,
      });
      expect(prisma.event.delete.mock.invocationCallOrder[0]).toBeLessThan(
        photoPurgeService.purgeObjects.mock.invocationCallOrder[0],
      );
      // The cover is not a photo, and its key is never logged.
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.deleted", eventId, callerId, photoCount: 1, audit: true },
        "Event deleted",
      );
    });

    it("purges nothing and deletes nothing when the delete transaction fails", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      prisma.photo.findMany.mockResolvedValue([{ s3Key: "photos/x" }] as never);
      prisma.event.delete.mockRejectedValue(new Error("db down"));

      await expect(service.delete(eventId, callerId)).rejects.toThrow("db down");

      expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.deleted" }),
        expect.anything(),
      );
    });

    it("deletes the event when a non-creator organizer removes it", async () => {
      const nonCreatorOrganizerAccess: EventAccess = {
        ...organizerAccess,
        userId: callerId,
        eventId: eventWithAccessOnly.id,
      };
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess({ ...eventWithAccessOnly, ...deactivation }, [nonCreatorOrganizerAccess]),
      );
      prisma.event.delete.mockResolvedValue(eventWithAccessOnly);

      await expect(service.delete(eventWithAccessOnly.id, callerId)).resolves.toBeUndefined();

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventWithAccessOnly.id } });
    });

    it("deletes the event when the creator has organizer access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      prisma.event.delete.mockResolvedValue(eventCreatedByUser);

      await expect(service.delete(eventId, callerId)).resolves.toBeUndefined();

      expect(eventCreatedByUser.creatorId).toBe(callerId);
      expect(organizerAccess.accessLevel).toBe(AccessLevel.ORGANIZER);
      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
    });

    it("does not attempt delete when the caller lacks organizer access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.delete(eventId, callerId)).rejects.toMatchObject({ response: { code: "ORGANIZER_ONLY" } });

      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.delete(eventId, callerId)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId)),
      );
      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.delete(eventId, callerId)).rejects.toThrow(ForbiddenException);
      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.delete(eventId, callerId)).rejects.toMatchObject({ response: { code: "ORGANIZER_ONLY" } });
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("throws when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));

      await expect(service.delete(eventId, callerId)).rejects.toMatchObject({ response: { code: "ORGANIZER_ONLY" } });
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("checks that the event exists before checking access", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.delete(eventId, callerId)).rejects.toThrow(NotFoundException);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when deleting an event", async () => {
      const prismaError = new Error("Database connection lost");
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(deactivatedEvent, [organizerAccess]));
      prisma.event.delete.mockRejectedValue(prismaError);

      await expect(service.delete(eventId, callerId)).rejects.toThrow(prismaError);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("regenerateInvitationUrl", () => {
    const newInvitationUrl = "new-uuid-value";

    const setupOrganizerRegenerate = (updatedInvitationUrl = newInvitationUrl) => {
      const updatedEvent: Event = { ...eventCreatedByUser, invitationUrl: updatedInvitationUrl };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventInvite.findUnique.mockResolvedValue(participantInvite);
      prisma.eventInvite.update.mockResolvedValue({ ...participantInvite, token: updatedInvitationUrl });
      prisma.event.update.mockResolvedValue(updatedEvent);
      return updatedEvent;
    };

    it("regenerates the invitation URL when the caller has organizer access", async () => {
      const updatedEvent = setupOrganizerRegenerate();

      const result = await service.regenerateInvitationUrl(eventId, callerId);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(prisma.eventInvite.findUnique).toHaveBeenCalledWith({
        where: { eventId_accessLevel: { eventId, accessLevel: AccessLevel.PARTICIPANT } },
      });
      expect(prisma.eventInvite.update).toHaveBeenCalledTimes(1);
      expect(prisma.eventInvite.update.mock.calls[0][0].where).toEqual({ id: participantInvite.id });
      const updatedToken = prisma.eventInvite.update.mock.calls[0][0].data.token as string;
      expect(updatedToken).not.toBe("");
      expect(updatedToken.length).toBeLessThanOrEqual(100);
      expect(updatedToken).not.toBe(invitationUrl);
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { invitationUrl: updatedToken },
      });
      expect(result).toEqual(updatedEvent);
      expect(result.invitationUrl).toBe(newInvitationUrl);
      expect(logger.info).toHaveBeenCalledWith(
        {
          event: "event.invite.regenerated",
          eventId,
          callerId,
          accessLevel: AccessLevel.PARTICIPANT,
          audit: true,
        },
        "Event invitation regenerated",
      );
    });

    it("regenerates the invitation URL when a non-creator organizer rotates the link", async () => {
      const nonCreatorOrganizerAccess: EventAccess = {
        ...organizerAccess,
        userId: callerId,
        eventId: eventWithAccessOnly.id,
      };
      const updatedEvent: Event = { ...eventWithAccessOnly, invitationUrl: newInvitationUrl };
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(eventWithAccessOnly, [nonCreatorOrganizerAccess]),
      );
      prisma.eventInvite.findUnique.mockResolvedValue({
        ...participantInvite,
        eventId: eventWithAccessOnly.id,
        token: eventWithAccessOnly.invitationUrl,
      });
      prisma.eventInvite.update.mockResolvedValue({
        ...participantInvite,
        eventId: eventWithAccessOnly.id,
        token: newInvitationUrl,
      });
      prisma.event.update.mockResolvedValue(updatedEvent);

      const result = await service.regenerateInvitationUrl(eventWithAccessOnly.id, callerId);

      expect(prisma.eventInvite.update).toHaveBeenCalled();
      expect(prisma.event.update).toHaveBeenCalled();
      expect(result.invitationUrl).toBe(newInvitationUrl);
    });

    it("preserves all other event fields when regenerating the invitation URL", async () => {
      setupOrganizerRegenerate();

      const result = await service.regenerateInvitationUrl(eventId, callerId);

      expect(result.id).toBe(eventCreatedByUser.id);
      expect(result.title).toBe(eventCreatedByUser.title);
      expect(result.description).toBe(eventCreatedByUser.description);
      expect(result.date).toEqual(eventCreatedByUser.date);
      expect(result.creatorId).toBe(eventCreatedByUser.creatorId);
      expect(result.createdAt).toEqual(eventCreatedByUser.createdAt);
      expect(result.updatedAt).toEqual(eventCreatedByUser.updatedAt);
      expect(result.invitationUrl).not.toBe(eventCreatedByUser.invitationUrl);
    });

    it("generates a different invitation URL on each regeneration", async () => {
      setupOrganizerRegenerate();
      prisma.eventInvite.update
        .mockResolvedValueOnce({ ...participantInvite, token: "first-uuid" })
        .mockResolvedValueOnce({ ...participantInvite, token: "second-uuid" });
      prisma.event.update
        .mockResolvedValueOnce({ ...eventCreatedByUser, invitationUrl: "first-uuid" })
        .mockResolvedValueOnce({ ...eventCreatedByUser, invitationUrl: "second-uuid" });

      await service.regenerateInvitationUrl(eventId, callerId);
      await service.regenerateInvitationUrl(eventId, callerId);

      const firstUrl = prisma.eventInvite.update.mock.calls[0][0].data.token as string;
      const secondUrl = prisma.eventInvite.update.mock.calls[1][0].data.token as string;
      expect(firstUrl).not.toBe(secondUrl);
    });

    it("updates the PARTICIPANT invite token and mirrors it onto Event.invitationUrl", async () => {
      setupOrganizerRegenerate();

      await service.regenerateInvitationUrl(eventId, callerId);

      const inviteUpdate = prisma.eventInvite.update.mock.calls[0][0];
      const eventUpdate = prisma.event.update.mock.calls[0][0];
      expect(inviteUpdate.where).toEqual({ id: participantInvite.id });
      expect(Object.keys(inviteUpdate.data)).toEqual(["token"]);
      expect(eventUpdate.where).toEqual({ id: eventId });
      expect(Object.keys(eventUpdate.data)).toEqual(["invitationUrl"]);
      expect(eventUpdate.data.invitationUrl).toBe(inviteUpdate.data.token);
    });

    it("does not attempt update when the caller lacks organizer access", async () => {
      prisma.event.findUnique.mockResolvedValueOnce(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();

      prisma.event.findUnique.mockResolvedValueOnce(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));
      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();

      prisma.event.findUnique.mockResolvedValueOnce(eventWithCallerAccess(eventCreatedByUser, []));
      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(ForbiddenException);
      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId)),
      );

      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(ForbiddenException);

      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });

      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });

      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the creator has no organizer event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(ForbiddenException);
    });

    it("checks that the event exists before checking access", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(NotFoundException);

      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the PARTICIPANT invite row is missing", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventInvite.findUnique.mockResolvedValue(null);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(
        new NotFoundException(
          RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(
            "Event invite",
            "access level",
            `${eventId}:${AccessLevel.PARTICIPANT}`,
          ),
        ),
      );

      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when updating the invitation URL", async () => {
      setupOrganizerRegenerate();
      const prismaError = new Error("Database connection lost");
      prisma.event.update.mockRejectedValue(prismaError);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(prismaError);

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.invite.regenerated" }),
        expect.any(String),
      );
    });

    it("allows findOne but denies regenerate for participants", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.findOne(eventId, callerId)).resolves.toEqual(eventCreatedByUser);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("invalidates the previous invitation URL for join attempts", async () => {
      setupOrganizerRegenerate("new-link");

      await service.regenerateInvitationUrl(eventId, callerId);

      prisma.user.findUnique.mockResolvedValue(otherUserWithDetails);
      prisma.eventInvite.findUnique.mockResolvedValue(null);

      await expect(service.joinByInvitationUrl(otherUserId, invitationUrl)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "invitation URL", invitationUrl)),
      );
    });
  });

  describe("regenerateInvite", () => {
    it("refuses new links into a closed event", async () => {
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess({ ...eventCreatedByUser, galleryClosesAt: new Date(Date.now() - 60_000) }, [
          organizerAccess,
        ]),
      );

      const failure = await service
        .regenerateInvite(eventId, callerId, AccessLevel.PARTICIPANT)
        .catch((e: unknown) => e);

      expect((failure as ApiException).getResponse()).toMatchObject({ code: "EVENT_GALLERY_CLOSED" });
      expect(prisma.eventInvite.update).not.toHaveBeenCalled();
    });

    it("rotates links of an upcoming event, which people can join", async () => {
      const upcoming = { ...eventCreatedByUser, galleryOpensAt: new Date(Date.now() + DAY_MS) };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(upcoming, [organizerAccess]));
      prisma.eventInvite.findUnique.mockResolvedValue({ ...viewerInvite, eventId });
      prisma.eventInvite.update.mockResolvedValue({ ...viewerInvite, eventId });
      prisma.event.findUniqueOrThrow.mockResolvedValue(upcoming);

      await expect(service.regenerateInvite(eventId, callerId, AccessLevel.VIEWER)).resolves.toEqual(upcoming);
      expect(prisma.eventInvite.update).toHaveBeenCalledTimes(1);
    });

    it("rotates a VIEWER invite token without updating Event.invitationUrl", async () => {
      const rotatedToken = "rotated-viewer-token";
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventInvite.findUnique.mockResolvedValue(viewerInvite);
      prisma.eventInvite.update.mockResolvedValue({ ...viewerInvite, token: rotatedToken });
      prisma.event.findUniqueOrThrow.mockResolvedValue(eventCreatedByUser);

      const result = await service.regenerateInvite(eventId, callerId, AccessLevel.VIEWER);

      expect(prisma.eventInvite.findUnique).toHaveBeenCalledWith({
        where: { eventId_accessLevel: { eventId, accessLevel: AccessLevel.VIEWER } },
      });
      expect(prisma.eventInvite.update).toHaveBeenCalledWith({
        where: { id: viewerInvite.id },
        data: { token: expect.any(String) as string },
      });
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(prisma.event.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: eventId } });
      expect(result).toEqual(eventCreatedByUser);
      expect(result.invitationUrl).toBe(eventCreatedByUser.invitationUrl);
      expect(logger.info).toHaveBeenCalledWith(
        {
          event: "event.invite.regenerated",
          eventId,
          callerId,
          accessLevel: AccessLevel.VIEWER,
          audit: true,
        },
        "Event invitation regenerated",
      );
    });

    it("delegates PARTICIPANT regeneration through regenerateInvitationUrl semantics", async () => {
      const updatedEvent: Event = { ...eventCreatedByUser, invitationUrl: "new-participant-token" };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventInvite.findUnique.mockResolvedValue(participantInvite);
      prisma.eventInvite.update.mockResolvedValue({ ...participantInvite, token: "new-participant-token" });
      prisma.event.update.mockResolvedValue(updatedEvent);

      const result = await service.regenerateInvite(eventId, callerId, AccessLevel.PARTICIPANT);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { invitationUrl: expect.any(String) as string },
      });
      expect(result.invitationUrl).toBe("new-participant-token");
    });
  });

  describe("listInvitesForCaller", () => {
    const invites = [participantInvite, viewerInvite];

    const gallery = (opensInMs: number, closesInMs: number) => ({
      event: {
        galleryOpensAt: new Date(Date.now() + opensInMs),
        galleryClosesAt: new Date(Date.now() + closesInMs),
        galleryClosedAt: null,
      },
    });
    const openGallery = gallery(-60_000, 60_000);

    it("returns invites when the caller is an organizer", async () => {
      prisma.eventAccess.findUnique.mockResolvedValue({ ...organizerAccess, ...openGallery } as never);
      prisma.eventInvite.findMany.mockResolvedValue(invites);

      const result = await service.listInvitesForCaller(eventId, callerId);

      expect(prisma.eventAccess.findUnique).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: callerId, eventId } },
        include: { event: { select: { galleryOpensAt: true, galleryClosesAt: true, galleryClosedAt: true } } },
      });
      expect(prisma.eventInvite.findMany).toHaveBeenCalledWith({
        where: { eventId, accessLevel: { in: ["PARTICIPANT", "VIEWER"] } },
      });
      expect(result).toEqual(invites);
    });

    it("returns invites for an upcoming event, which people can join", async () => {
      prisma.eventAccess.findUnique.mockResolvedValue({ ...organizerAccess, ...gallery(60_000, DAY_MS) } as never);
      prisma.eventInvite.findMany.mockResolvedValue(invites);

      await expect(service.listInvitesForCaller(eventId, callerId)).resolves.toEqual(invites);
    });

    it("returns no invites for a closed event, even to an organizer", async () => {
      prisma.eventAccess.findUnique.mockResolvedValue({ ...organizerAccess, ...gallery(-DAY_MS, -60_000) } as never);

      await expect(service.listInvitesForCaller(eventId, callerId)).resolves.toEqual([]);
      expect(prisma.eventInvite.findMany).not.toHaveBeenCalled();
    });

    it("returns an empty array when the caller is a participant", async () => {
      prisma.eventAccess.findUnique.mockResolvedValue(participantAccess);

      const result = await service.listInvitesForCaller(eventId, callerId);

      expect(result).toEqual([]);
      expect(prisma.eventInvite.findMany).not.toHaveBeenCalled();
    });

    it("returns an empty array when the caller is a viewer", async () => {
      prisma.eventAccess.findUnique.mockResolvedValue(viewerAccess);

      const result = await service.listInvitesForCaller(eventId, callerId);

      expect(result).toEqual([]);
      expect(prisma.eventInvite.findMany).not.toHaveBeenCalled();
    });

    it("returns an empty array when the caller has no access", async () => {
      prisma.eventAccess.findUnique.mockResolvedValue(null);

      const result = await service.listInvitesForCaller(eventId, callerId);

      expect(result).toEqual([]);
      expect(prisma.eventInvite.findMany).not.toHaveBeenCalled();
    });
  });

  describe("leaveEvent", () => {
    it("ignores photos=DELETE on a closed event, so kept evidence can't be deleted", async () => {
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess({ ...eventCreatedByUser, galleryClosesAt: new Date(Date.now() - 60_000) }, [
          participantAccess,
        ]),
      );
      prisma.eventAccess.delete.mockResolvedValue(participantAccess);

      await service.leaveEvent(eventId, callerId, "DELETE");

      expect(prisma.eventAccess.delete).toHaveBeenCalledTimes(1);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
      expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
    });

    it("removes participant access when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      prisma.eventAccess.delete.mockResolvedValue(participantAccess);

      await expect(service.leaveEvent(eventId, callerId)).resolves.toBeUndefined();

      expect(prisma.eventAccess.delete).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: callerId, eventId } },
      });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.left", eventId, callerId, photos: "KEEP", photosDeleted: 0, bytesFreed: "0", audit: true },
        "User left event",
      );
    });

    it("keeps the member's photos by default and records no ban, so they can rejoin", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      prisma.eventAccess.delete.mockResolvedValue(participantAccess);

      await service.leaveEvent(eventId, callerId);

      expect(prisma.photo.findMany).not.toHaveBeenCalled();
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
      expect(prisma.eventBan.upsert).not.toHaveBeenCalled();
      expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
    });

    it("with DELETE, deletes the member's photos in the event, frees their space, and purges the objects", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      prisma.eventAccess.delete.mockResolvedValue(participantAccess);
      prisma.photo.findMany.mockResolvedValue([
        { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", s3Key: "photos/a", sizeBytes: 1000 },
        { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", s3Key: "photos/b", sizeBytes: 2500 },
      ] as never);
      prisma.photo.deleteMany.mockResolvedValue({ count: 2 });
      prisma.report.updateMany.mockResolvedValue({ count: 0 });

      await service.leaveEvent(eventId, callerId, "DELETE");

      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId, addedById: callerId, id: { notIn: [] } } }),
      );
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] } },
      });
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith(["photos/a", "photos/b"], {
        event: "event.member.photos_purged",
        eventId,
        callerId,
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.left", photos: "DELETE", photosDeleted: 2, bytesFreed: "3500" }),
        "User left event",
      );
    });

    it("removes viewer access when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));
      prisma.eventAccess.delete.mockResolvedValue(viewerAccess);

      await expect(service.leaveEvent(eventId, callerId)).resolves.toBeUndefined();

      expect(prisma.eventAccess.delete).toHaveBeenCalled();
    });

    it("removes organizer access when another organizer remains", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.count.mockResolvedValue(2);
      prisma.eventAccess.delete.mockResolvedValue(organizerAccess);

      await expect(service.leaveEvent(eventId, callerId)).resolves.toBeUndefined();

      expect(prisma.eventAccess.count).toHaveBeenCalledWith({
        where: { eventId, accessLevel: AccessLevel.ORGANIZER },
      });
      expect(prisma.eventAccess.delete).toHaveBeenCalled();
    });

    it("does not mutate the event row when leaving", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      prisma.eventAccess.delete.mockResolvedValue(participantAccess);

      await service.leaveEvent(eventId, callerId);

      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("blocks the last organizer from leaving", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.count.mockResolvedValue(1);

      await expect(service.leaveEvent(eventId, callerId)).rejects.toMatchObject({
        response: { code: "LAST_ORGANIZER" },
      });

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("treats the creator without an event access row as not a member", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.leaveEvent(eventId, callerId)).rejects.toMatchObject({ response: { code: "NOT_A_MEMBER" } });

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.leaveEvent(eventId, callerId)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId)),
      );

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access row", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.leaveEvent(eventId, callerId)).rejects.toMatchObject({ response: { code: "NOT_A_MEMBER" } });

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when deleting event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      const prismaError = new Error("Database connection lost");
      prisma.eventAccess.delete.mockRejectedValue(prismaError);

      await expect(service.leaveEvent(eventId, callerId)).rejects.toThrow(prismaError);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("denies findOne after the caller leaves the event", async () => {
      prisma.event.findUnique.mockResolvedValueOnce(
        eventWithCallerAccess(eventCreatedByUser, [targetParticipantAccess]),
      );
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await service.leaveEvent(eventId, targetUserId);

      prisma.event.findUnique.mockResolvedValueOnce(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.findOne(eventId, targetUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getEventParticipants", () => {
    const organizerRow = eventAccessWithUser(organizerAccess, userWithDetails);
    const targetRow = eventAccessWithUser(targetParticipantAccess, targetUserWithDetails);

    it("returns all members when the caller is an organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow, targetRow]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(prisma.eventAccess.findMany).toHaveBeenCalledWith(participantsLookup(eventId, callerId));
      expect(result).toEqual([
        {
          userId: callerId,
          username: "jane",
          name: "Jane Doe",
          accessLevel: AccessLevel.ORGANIZER,
          avatarUrl: null,
          isBlockedByCaller: false,
        },
        participantWithDetails,
      ]);
    });

    it("returns all members when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow, targetRow]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result).toHaveLength(2);
    });

    it("returns all members when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow, targetRow]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result).toHaveLength(2);
    });

    it("returns members when the caller is the creator with read via creatorId", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result).toEqual([
        {
          userId: callerId,
          username: "jane",
          name: "Jane Doe",
          accessLevel: AccessLevel.ORGANIZER,
          avatarUrl: null,
          isBlockedByCaller: false,
        },
      ]);
    });

    it("orders participants by createdAt ascending", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow, targetRow]);

      await service.getEventParticipants(eventId, callerId);

      expect(prisma.eventAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "asc" } }),
      );
    });

    it("maps participant names from user details", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([targetRow]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result[0].name).toBe("Target User");
    });

    it("presigns an avatar URL per member from the rows already loaded", async () => {
      const avatarS3Key = `avatars/${targetUserId}/99999999-9999-9999-9999-999999999999`;
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([
        organizerRow,
        eventAccessWithUser(targetParticipantAccess, {
          ...targetUserWithDetails,
          details: { ...targetUserWithDetails.details!, avatarS3Key },
        }),
      ]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result.map((participant) => participant.avatarUrl)).toEqual([
        null,
        `https://s3.example/${avatarS3Key}?sig=1`,
      ]);
      // No lookup per member: the keys came with the single membership query.
      expect(prisma.eventAccess.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.userDetails.findMany).not.toHaveBeenCalled();
      expect(prisma.userDetails.findUnique).not.toHaveBeenCalled();
    });

    it("excludes members without user details from the list", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([
        eventAccessWithUser(targetParticipantAccess, { ...targetUserWithDetails, details: null }),
      ]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result).toEqual([]);
    });

    it("does not expose providerSub in the response shape", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([targetRow]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result[0]).toEqual(participantWithDetails);
      expect(result[0]).not.toHaveProperty("providerSub");
    });

    it("marks the members the caller has blocked, from the block rows the same query returned", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([
        organizerRow,
        eventAccessWithUser(targetParticipantAccess, targetUserWithDetails, true),
      ]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(result.map((participant) => participant.isBlockedByCaller)).toEqual([false, true]);
      expect(prisma.userBlock.findMany).not.toHaveBeenCalled();
    });

    it("only ever asks for blocks the caller made, never for blocks against the caller", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([]);

      await service.getEventParticipants(eventId, callerId);

      const [args] = prisma.eventAccess.findMany.mock.calls[0];
      expect(args?.include?.user).toEqual({
        include: { details: true, blocksReceived: { where: { blockerId: callerId }, select: { id: true } } },
      });
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getEventParticipants(eventId, callerId)).rejects.toThrow(
        new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId)),
      );

      expect(prisma.eventAccess.findMany).not.toHaveBeenCalled();
    });

    it("throws when the caller is unrelated to the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.getEventParticipants(eventId, otherUserId)).rejects.toThrow(ForbiddenException);

      expect(prisma.eventAccess.findMany).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when loading participants", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      const prismaError = new Error("Database connection lost");
      prisma.eventAccess.findMany.mockRejectedValue(prismaError);

      await expect(service.getEventParticipants(eventId, callerId)).rejects.toThrow(prismaError);
    });
  });

  describe("updateUserAccessLevel", () => {
    const targetAccessWithUser = eventAccessWithUser(targetParticipantAccess, targetUserWithDetails);

    const setupOrganizerUpdate = () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findUnique.mockResolvedValue(targetAccessWithUser);
    };

    it("promotes a participant to organizer when the caller is an organizer", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.update.mockResolvedValue(
        eventAccessWithUser({ ...targetParticipantAccess, accessLevel: AccessLevel.ORGANIZER }, targetUserWithDetails),
      );

      const result = await service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.ORGANIZER);

      expect(prisma.eventAccess.update).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: targetUserId, eventId } },
        data: { accessLevel: AccessLevel.ORGANIZER },
        include: eventAccessWithUserInclude(callerId),
      });
      expect(result).toEqual({ ...participantWithDetails, accessLevel: AccessLevel.ORGANIZER });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "event.access_level.updated",
          eventId,
          callerId,
          targetUserId,
          accessLevel: AccessLevel.ORGANIZER,
          audit: true,
        }),
        "Event member access level updated",
      );
    });

    it("demotes an organizer to participant when another organizer exists", async () => {
      const targetOrganizerAccess = { ...targetParticipantAccess, accessLevel: AccessLevel.ORGANIZER };
      setupOrganizerUpdate();
      prisma.eventAccess.findUnique.mockResolvedValue(
        eventAccessWithUser(targetOrganizerAccess, targetUserWithDetails),
      );
      prisma.eventAccess.count.mockResolvedValue(2);
      prisma.eventAccess.update.mockResolvedValue(
        eventAccessWithUser({ ...targetOrganizerAccess, accessLevel: AccessLevel.PARTICIPANT }, targetUserWithDetails),
      );

      await service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.PARTICIPANT);

      expect(prisma.eventAccess.count).toHaveBeenCalled();
      expect(prisma.eventAccess.update).toHaveBeenCalled();
    });

    it("changes a participant to viewer", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.update.mockResolvedValue(
        eventAccessWithUser({ ...targetParticipantAccess, accessLevel: AccessLevel.VIEWER }, targetUserWithDetails),
      );

      const result = await service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER);

      expect(result.accessLevel).toBe(AccessLevel.VIEWER);
    });

    it("changes a viewer to participant", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.findUnique.mockResolvedValue(
        eventAccessWithUser({ ...targetParticipantAccess, accessLevel: AccessLevel.VIEWER }, targetUserWithDetails),
      );
      prisma.eventAccess.update.mockResolvedValue(targetAccessWithUser);

      const result = await service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.PARTICIPANT);

      expect(result.accessLevel).toBe(AccessLevel.PARTICIPANT);
    });

    it("allows a non-creator organizer to change access levels", async () => {
      const nonCreatorOrganizerAccess: EventAccess = {
        ...organizerAccess,
        userId: callerId,
        eventId: eventWithAccessOnly.id,
      };
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(eventWithAccessOnly, [nonCreatorOrganizerAccess]),
      );
      prisma.eventAccess.findUnique.mockResolvedValue(
        eventAccessWithUser({ ...targetParticipantAccess, eventId: eventWithAccessOnly.id }, targetUserWithDetails),
      );
      prisma.eventAccess.update.mockResolvedValue(
        eventAccessWithUser(
          { ...targetParticipantAccess, eventId: eventWithAccessOnly.id, accessLevel: AccessLevel.VIEWER },
          targetUserWithDetails,
        ),
      );

      await service.updateUserAccessLevel(eventWithAccessOnly.id, callerId, targetUserId, AccessLevel.VIEWER);

      expect(prisma.eventAccess.update).toHaveBeenCalled();
    });

    it("blocks demoting the last organizer", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.findUnique.mockResolvedValue(
        eventAccessWithUser({ ...targetParticipantAccess, accessLevel: AccessLevel.ORGANIZER }, targetUserWithDetails),
      );
      prisma.eventAccess.count.mockResolvedValue(1);

      await expect(
        service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.PARTICIPANT),
      ).rejects.toMatchObject({ response: { code: "LAST_ORGANIZER" } });

      expect(prisma.eventAccess.update).not.toHaveBeenCalled();
    });

    it("blocks the caller from modifying their own access level", async () => {
      setupOrganizerUpdate();

      await expect(
        service.updateUserAccessLevel(eventId, callerId, callerId, AccessLevel.PARTICIPANT),
      ).rejects.toMatchObject({ response: { code: "CANNOT_CHANGE_OWN_ROLE" } });

      expect(prisma.eventAccess.update).not.toHaveBeenCalled();
    });

    it("succeeds without updating when the access level is unchanged", async () => {
      setupOrganizerUpdate();

      const result = await service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.PARTICIPANT);

      expect(prisma.eventAccess.update).not.toHaveBeenCalled();
      expect(result).toEqual(participantWithDetails);
    });

    it("does not mutate the event row when updating access level", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.update.mockResolvedValue(targetAccessWithUser);

      await service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(
        service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER),
      ).rejects.toMatchObject({ response: { code: "ORGANIZER_ONLY" } });
    });

    it("throws when the target is not a member of the event", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER),
      ).rejects.toMatchObject({ response: { code: "TARGET_NOT_A_MEMBER" } });
    });

    it("re-throws unexpected database errors when updating access level", async () => {
      setupOrganizerUpdate();
      const prismaError = new Error("Database connection lost");
      prisma.eventAccess.update.mockRejectedValue(prismaError);

      await expect(service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER)).rejects.toThrow(
        prismaError,
      );

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.access_level.updated" }),
        expect.any(String),
      );
    });

    it("allows findOne but denies update after demoting the target to viewer", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.update.mockResolvedValue(
        eventAccessWithUser({ ...targetParticipantAccess, accessLevel: AccessLevel.VIEWER }, targetUserWithDetails),
      );

      await service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER);

      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(eventCreatedByUser, [{ ...targetParticipantAccess, accessLevel: AccessLevel.VIEWER }]),
      );

      await expect(service.findOne(eventId, targetUserId)).resolves.toEqual(eventCreatedByUser);

      await expect(service.update(eventId, targetUserId, updateTitleDto)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
    });
  });

  describe("listBans", () => {
    it("lists the event's bans newest first, with each member's profile", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventBan.findMany.mockResolvedValue([]);

      await expect(service.listBans(eventId, callerId)).resolves.toEqual([]);

      expect(prisma.eventBan.findMany).toHaveBeenCalledWith({
        where: { eventId },
        include: { user: { include: userWithDetailsInclude } },
        orderBy: { createdAt: "desc" },
      });
    });

    it("is for organizers only", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.listBans(eventId, callerId)).rejects.toMatchObject({ response: { code: "ORGANIZER_ONLY" } });
      expect(prisma.eventBan.findMany).not.toHaveBeenCalled();
    });
  });

  describe("liftBan", () => {
    it("deletes the ban and audits it", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventBan.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.liftBan(eventId, callerId, targetUserId)).resolves.toBeUndefined();

      expect(prisma.eventBan.deleteMany).toHaveBeenCalledWith({ where: { eventId, userId: targetUserId } });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.ban.lifted", eventId, callerId, userId: targetUserId, audit: true },
        "Event ban lifted",
      );
    });

    it("is idempotent: lifting a ban that is not there succeeds and logs nothing", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventBan.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.liftBan(eventId, callerId, targetUserId)).resolves.toBeUndefined();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("is for organizers only", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.liftBan(eventId, callerId, targetUserId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
      expect(prisma.eventBan.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("removeUserFromEvent", () => {
    beforeEach(() => {
      // Removal runs in one interactive transaction, against the same mock client.
      prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
      prisma.eventAccess.deleteMany.mockResolvedValue({ count: 1 });
    });

    const setupOrganizerRemove = (targetAccess: EventAccess = targetParticipantAccess) => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findUnique.mockResolvedValue(targetAccess);
    };

    it("removes a participant when the caller is an organizer", async () => {
      setupOrganizerRemove();

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).resolves.toBeUndefined();

      expect(prisma.eventAccess.deleteMany).toHaveBeenCalledWith({ where: { eventId, userId: targetUserId } });
      expect(logger.info).toHaveBeenCalledWith(
        {
          event: "event.member.removed",
          eventId,
          callerId,
          targetUserId,
          photos: "KEEP",
          photosDeleted: 0,
          reportsClosed: 0,
          banned: true,
          audit: true,
        },
        "Event member removed",
      );
    });

    it("bans the removed member from rejoining, recording who removed them", async () => {
      setupOrganizerRemove();

      await service.removeUserFromEvent(eventId, callerId, targetUserId);

      expect(prisma.eventBan.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId, userId: targetUserId } },
        create: { eventId, userId: targetUserId, bannedById: callerId },
        update: {},
      });
    });

    it("keeps the member's photos by default", async () => {
      setupOrganizerRemove();

      await service.removeUserFromEvent(eventId, callerId, targetUserId);

      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith([], expect.anything());
    });

    it("with DELETE, deletes the member's photos in the event and purges their objects after the commit", async () => {
      setupOrganizerRemove();
      const uploaded = [
        { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", s3Key: "photos/a", sizeBytes: 1000 },
        { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", s3Key: "photos/b", sizeBytes: 2000 },
      ];
      prisma.photo.findMany.mockResolvedValue(uploaded as never);
      prisma.photo.deleteMany.mockResolvedValue({ count: 2 });
      prisma.report.updateMany.mockResolvedValue({ count: 1 });

      await service.removeUserFromEvent(eventId, callerId, targetUserId, "DELETE");

      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId, addedById: targetUserId, id: { notIn: [] } } }),
      );
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: uploaded.map((photo) => photo.id) } },
      });
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith(["photos/a", "photos/b"], {
        event: "event.member.photos_purged",
        eventId,
        callerId,
        targetUserId,
      });
      expect(photoPurgeService.purgeObjects.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ photos: "DELETE", photosDeleted: 2, reportsClosed: 1 }),
        "Event member removed",
      );
    });

    it("removes a viewer when the caller is an organizer", async () => {
      setupOrganizerRemove({ ...targetParticipantAccess, accessLevel: AccessLevel.VIEWER });

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).resolves.toBeUndefined();
    });

    it("removes an organizer when another organizer remains", async () => {
      setupOrganizerRemove({ ...targetParticipantAccess, accessLevel: AccessLevel.ORGANIZER });
      prisma.eventAccess.count.mockResolvedValue(2);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).resolves.toBeUndefined();
    });

    it("allows a non-creator organizer to remove members", async () => {
      const nonCreatorOrganizerAccess: EventAccess = {
        ...organizerAccess,
        userId: callerId,
        eventId: eventWithAccessOnly.id,
      };
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(eventWithAccessOnly, [nonCreatorOrganizerAccess]),
      );
      prisma.eventAccess.findUnique.mockResolvedValue({
        ...targetParticipantAccess,
        eventId: eventWithAccessOnly.id,
      });

      await service.removeUserFromEvent(eventWithAccessOnly.id, callerId, targetUserId);

      expect(prisma.eventAccess.deleteMany).toHaveBeenCalled();
    });

    it("blocks removing the last organizer", async () => {
      setupOrganizerRemove({ ...targetParticipantAccess, accessLevel: AccessLevel.ORGANIZER });
      prisma.eventAccess.count.mockResolvedValue(1);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toMatchObject({
        response: { code: "LAST_ORGANIZER" },
      });

      expect(prisma.eventAccess.deleteMany).not.toHaveBeenCalled();
    });

    it("blocks self-removal via removeUserFromEvent", async () => {
      setupOrganizerRemove();

      await expect(service.removeUserFromEvent(eventId, callerId, callerId)).rejects.toMatchObject({
        response: { code: "CANNOT_REMOVE_SELF" },
      });

      expect(prisma.eventAccess.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes only the target user event access row", async () => {
      setupOrganizerRemove();

      await service.removeUserFromEvent(eventId, callerId, targetUserId);

      expect(prisma.eventAccess.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toThrow(NotFoundException);
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toMatchObject({
        response: { code: "ORGANIZER_ONLY" },
      });
    });

    it("throws when the target is not a member of the event", async () => {
      setupOrganizerRemove();
      prisma.eventAccess.findUnique.mockResolvedValue(null);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toMatchObject({
        response: { code: "TARGET_NOT_A_MEMBER" },
      });
    });

    it("re-throws unexpected database errors when deleting event access", async () => {
      setupOrganizerRemove();
      const prismaError = new Error("Database connection lost");
      prisma.eventAccess.deleteMany.mockRejectedValue(prismaError);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toThrow(prismaError);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("denies findOne for the removed target user", async () => {
      setupOrganizerRemove();
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await service.removeUserFromEvent(eventId, callerId, targetUserId);

      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.findOne(eventId, targetUserId)).rejects.toThrow(ForbiddenException);
    });

    it("uses leaveEvent for self-removal instead of removeUserFromEvent", async () => {
      prisma.event.findUnique.mockResolvedValueOnce(
        eventWithCallerAccess(eventCreatedByUser, [targetParticipantAccess]),
      );
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await service.leaveEvent(eventId, targetUserId);

      expect(prisma.eventAccess.delete).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: targetUserId, eventId } },
      });

      const targetOrganizerAccess: EventAccess = {
        ...targetParticipantAccess,
        accessLevel: AccessLevel.ORGANIZER,
      };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [targetOrganizerAccess]));

      await expect(service.removeUserFromEvent(eventId, targetUserId, targetUserId)).rejects.toMatchObject({
        response: { code: "CANNOT_REMOVE_SELF" },
      });
    });
  });
});
