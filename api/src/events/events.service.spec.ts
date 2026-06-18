import { accessibleBy } from "@casl/prisma";
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AccessLevel, Event, EventAccess, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { UserWithDetails, userWithDetailsInclude } from "src/users/users.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "./events.abilities";
import { EVENT_SERVICE_ERRORS } from "./events.constants";
import { EventsService } from "./events.service";
import { eventAccessWithUserInclude, eventWithCallerAccessInclude } from "./events.types";

const buildReadAccessibleWhere = (lookupUserId: string): Prisma.EventWhereInput => {
  const ability = new AbilityFactory().createForUser({ id: lookupUserId, isOnboarded: true });
  return accessibleBy(ability, EVENT_ACTIONS.READ).ofType(EVENT_SUBJECT) as Prisma.EventWhereInput;
};

describe("EventsService", () => {
  let service: EventsService;
  let prisma: DeepMockProxy<PrismaClient>;
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
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const userWithDetails: UserWithDetails = {
    id: creatorId,
    providerSub,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId: creatorId,
      email: "jane@example.com",
      name: "Jane Doe",
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
    createdAt: now,
    updatedAt: now,
  };

  const otherUserWithDetails: UserWithDetails = {
    id: otherUserId,
    providerSub: "auth0|other",
    createdAt: now,
    updatedAt: now,
    details: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      userId: otherUserId,
      email: "other@example.com",
      name: "Other User",
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
    createdAt: now,
    updatedAt: now,
    details: {
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      userId: targetUserId,
      email: "target@example.com",
      name: "Target User",
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
    name: "Target User",
    accessLevel: AccessLevel.PARTICIPANT,
  };

  const eventAccessWithUser = (access: EventAccess, user: UserWithDetails) => ({
    ...access,
    user,
  });

  const participantsLookup = (lookupEventId: string) => ({
    where: { eventId: lookupEventId },
    include: eventAccessWithUserInclude,
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
    logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        AbilityFactory,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: PinoLogger,
          useValue: logger,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);

    prisma.user.findUnique.mockResolvedValue(userWithDetails);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
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
      expect(result).toEqual(createdEvent);
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.created", eventId: createdEvent.id, creatorId },
        "Event created",
      );
    });

    it("grants the creator organizer access when the event is created", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(createdEvent);

      await service.create(creatorId, createEventDto);

      expect(prisma.event.create.mock.calls[0][0].data).toMatchObject(creatorOrganizerAccessGrant);
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

      const firstInvitationUrl = prisma.event.create.mock.calls[0][0].data.invitationUrl;
      const secondInvitationUrl = prisma.event.create.mock.calls[1][0].data.invitationUrl;

      expect(firstInvitationUrl).not.toEqual(secondInvitationUrl);
      expect(firstInvitationUrl.length).toBeLessThanOrEqual(100);
      expect(secondInvitationUrl.length).toBeLessThanOrEqual(100);
    });

    it("throws when the creator does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.create(creatorId, createEventDto)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.CREATOR_NOT_FOUND(creatorId)),
      );
      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the user has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.create(creatorId, createEventDto)).rejects.toThrow(
        new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE),
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
    const setupSuccessfulJoin = () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(null);
      prisma.eventAccess.create.mockResolvedValue(newParticipantAccess);
    };

    it("joins the event when the caller is onboarded and the invitation URL is valid", async () => {
      setupSuccessfulJoin();

      const result = await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: callerId },
        include: userWithDetailsInclude,
      });
      expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { invitationUrl } });
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

    it("grants participant access when joining via invitation URL", async () => {
      setupSuccessfulJoin();

      await service.joinByInvitationUrl(callerId, invitationUrl);

      expect(prisma.eventAccess.create.mock.calls[0][0].data.accessLevel).toBe(AccessLevel.PARTICIPANT);
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
        createdAt: eventCreatedByUser.createdAt,
        updatedAt: eventCreatedByUser.updatedAt,
      });
      expect(result).not.toHaveProperty("eventAccesses");
    });

    it("allows a user who is not the creator to join via invitation URL", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccessOnly);
      prisma.eventAccess.findUnique.mockResolvedValue(null);
      prisma.eventAccess.create.mockResolvedValue({
        ...newParticipantAccess,
        eventId: eventWithAccessOnly.id,
      });

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

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(UnprocessableEntityException);

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.event.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE),
      );

      expect(prisma.event.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the caller does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.CALLER_NOT_FOUND(callerId)),
      );

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the invitation URL does not match any event", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.joinByInvitationUrl(callerId, invalidUrl)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.INVITATION_NOT_FOUND(invalidUrl)),
      );

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the caller has already joined the event", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(participantAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new ConflictException(EVENT_SERVICE_ERRORS.ALREADY_JOINED(eventId)),
      );

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the creator attempts to join via their own invitation link", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(organizerAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new ConflictException(EVENT_SERVICE_ERRORS.ALREADY_JOINED(eventId)),
      );

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("throws when the caller already has organizer access", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(organizerAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(ConflictException);

      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });

    it("does not upgrade existing viewer access when joining again", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventCreatedByUser);
      prisma.eventAccess.findUnique.mockResolvedValue(viewerAccess);

      await expect(service.joinByInvitationUrl(callerId, invitationUrl)).rejects.toThrow(
        new ConflictException(EVENT_SERVICE_ERRORS.ALREADY_JOINED(eventId)),
      );

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
        createdAt: eventCreatedByUser.createdAt,
        updatedAt: eventCreatedByUser.updatedAt,
      });
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne(eventId, callerId)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );
    });

    it("throws when the caller has no relationship to the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.findOne(eventId, otherUserId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId)),
      );
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

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(ForbiddenException);
      await expect(service.delete(eventId, callerId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("update", () => {
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

    it("updates only the fields provided in the dto", async () => {
      const updatedEvent: Event = {
        ...eventCreatedByUser,
        title: updateAllFieldsDto.title!,
        date: new Date(updateAllFieldsDto.date!),
        description: updateAllFieldsDto.description!,
      };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue(updatedEvent);

      await service.update(eventId, callerId, updateAllFieldsDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: {
          title: updateAllFieldsDto.title,
          date: new Date(updateAllFieldsDto.date!),
          description: updateAllFieldsDto.description,
        },
      });
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
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue({
        ...eventCreatedByUser,
        date: new Date(updateDateDto.date!),
      });

      await service.update(eventId, callerId, updateDateDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { date: new Date("2026-10-01T18:00:00.000Z") },
      });
      const updateData = prisma.event.update.mock.calls[0][0].data;
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

    it("accepts a date-only ISO string", async () => {
      const dateOnlyDto: UpdateEventDto = { date: "2026-10-01" };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.update.mockResolvedValue({
        ...eventCreatedByUser,
        date: new Date("2026-10-01"),
      });

      await service.update(eventId, callerId, dateOnlyDto);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { date: new Date("2026-10-01") },
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

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(ForbiddenException);

      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("performs the authorization check even when the dto is empty", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.update(eventId, callerId, emptyUpdateDto)).rejects.toThrow(ForbiddenException);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));

      await expect(service.update(eventId, callerId, updateTitleDto)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );
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

  describe("delete", () => {
    it("deletes the event when the caller has organizer access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.delete.mockResolvedValue(eventCreatedByUser);

      await expect(service.delete(eventId, callerId)).resolves.toBeUndefined();

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.deleted", eventId, callerId, audit: true },
        "Event deleted",
      );
    });

    it("deletes the event when a non-creator organizer removes it", async () => {
      const nonCreatorOrganizerAccess: EventAccess = {
        ...organizerAccess,
        userId: callerId,
        eventId: eventWithAccessOnly.id,
      };
      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(eventWithAccessOnly, [nonCreatorOrganizerAccess]),
      );
      prisma.event.delete.mockResolvedValue(eventWithAccessOnly);

      await expect(service.delete(eventWithAccessOnly.id, callerId)).resolves.toBeUndefined();

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventWithAccessOnly.id } });
    });

    it("deletes the event when the creator has organizer access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.event.delete.mockResolvedValue(eventCreatedByUser);

      await expect(service.delete(eventId, callerId)).resolves.toBeUndefined();

      expect(eventCreatedByUser.creatorId).toBe(callerId);
      expect(organizerAccess.accessLevel).toBe(AccessLevel.ORGANIZER);
      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
    });

    it("does not attempt delete when the caller lacks organizer access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.delete(eventId, callerId)).rejects.toThrow(ForbiddenException);

      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.delete(eventId, callerId)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );
      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.delete(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.DELETE_FORBIDDEN(eventId)),
      );
      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.delete(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.DELETE_FORBIDDEN(eventId)),
      );
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("throws when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));

      await expect(service.delete(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.DELETE_FORBIDDEN(eventId)),
      );
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
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
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
      prisma.event.update.mockResolvedValue(updatedEvent);
      return updatedEvent;
    };

    it("regenerates the invitation URL when the caller has organizer access", async () => {
      const updatedEvent = setupOrganizerRegenerate();

      const result = await service.regenerateInvitationUrl(eventId, callerId);

      expect(prisma.event.findUnique).toHaveBeenCalledWith(eventLookup(eventId, callerId));
      expect(prisma.event.update).toHaveBeenCalledTimes(1);
      expect(prisma.event.update.mock.calls[0][0].where).toEqual({ id: eventId });
      const updatedInvitationUrl = prisma.event.update.mock.calls[0][0].data.invitationUrl as string;
      expect(updatedInvitationUrl).not.toBe("");
      expect(updatedInvitationUrl.length).toBeLessThanOrEqual(100);
      expect(updatedInvitationUrl).not.toBe(invitationUrl);
      expect(result).toEqual(updatedEvent);
      expect(result.invitationUrl).toBe(newInvitationUrl);
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.invitation_url.regenerated", eventId, callerId, audit: true },
        "Event invitation URL regenerated",
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
      prisma.event.update.mockResolvedValue(updatedEvent);

      const result = await service.regenerateInvitationUrl(eventWithAccessOnly.id, callerId);

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
      prisma.event.update
        .mockResolvedValueOnce({ ...eventCreatedByUser, invitationUrl: "first-uuid" })
        .mockResolvedValueOnce({ ...eventCreatedByUser, invitationUrl: "second-uuid" });

      await service.regenerateInvitationUrl(eventId, callerId);
      await service.regenerateInvitationUrl(eventId, callerId);

      const firstUrl = prisma.event.update.mock.calls[0][0].data.invitationUrl as string;
      const secondUrl = prisma.event.update.mock.calls[1][0].data.invitationUrl as string;
      expect(firstUrl).not.toBe(secondUrl);
    });

    it("updates only the invitation URL in the database", async () => {
      setupOrganizerRegenerate();

      await service.regenerateInvitationUrl(eventId, callerId);

      const updatePayload = prisma.event.update.mock.calls[0][0];
      expect(updatePayload.where).toEqual({ id: eventId });
      expect(Object.keys(updatePayload.data)).toEqual(["invitationUrl"]);
      expect(typeof updatePayload.data.invitationUrl).toBe("string");
    });

    it("does not attempt update when the caller lacks organizer access", async () => {
      prisma.event.findUnique.mockResolvedValueOnce(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();

      prisma.event.findUnique.mockResolvedValueOnce(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));
      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();

      prisma.event.findUnique.mockResolvedValueOnce(eventWithCallerAccess(eventCreatedByUser, []));
      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );

      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [viewerAccess]));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("throws when the creator has no organizer event access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );
    });

    it("checks that the event exists before checking access", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(NotFoundException);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when updating the invitation URL", async () => {
      setupOrganizerRegenerate();
      const prismaError = new Error("Database connection lost");
      prisma.event.update.mockRejectedValue(prismaError);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(prismaError);

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.invitation_url.regenerated" }),
        expect.any(String),
      );
    });

    it("allows findOne but denies regenerate for participants", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.findOne(eventId, callerId)).resolves.toEqual(eventCreatedByUser);

      await expect(service.regenerateInvitationUrl(eventId, callerId)).rejects.toThrow(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("invalidates the previous invitation URL for join attempts", async () => {
      setupOrganizerRegenerate("new-link");

      await service.regenerateInvitationUrl(eventId, callerId);

      prisma.user.findUnique.mockResolvedValue(otherUserWithDetails);
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.joinByInvitationUrl(otherUserId, invitationUrl)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.INVITATION_NOT_FOUND(invitationUrl)),
      );
    });
  });

  describe("leaveEvent", () => {
    it("removes participant access when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));
      prisma.eventAccess.delete.mockResolvedValue(participantAccess);

      await expect(service.leaveEvent(eventId, callerId)).resolves.toBeUndefined();

      expect(prisma.eventAccess.delete).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: callerId, eventId } },
      });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.left", eventId, callerId, audit: true },
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

      await expect(service.leaveEvent(eventId, callerId)).rejects.toThrow(
        new UnprocessableEntityException(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(eventId)),
      );

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("treats the creator without an event access row as not a member", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.leaveEvent(eventId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, callerId)),
      );

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.leaveEvent(eventId, callerId)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("throws when the caller has no event access row", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.leaveEvent(eventId, callerId)).rejects.toThrow(ForbiddenException);

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

      await expect(service.findOne(eventId, targetUserId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId)),
      );
    });
  });

  describe("getEventParticipants", () => {
    const organizerRow = eventAccessWithUser(organizerAccess, userWithDetails);
    const targetRow = eventAccessWithUser(targetParticipantAccess, targetUserWithDetails);

    it("returns all members when the caller is an organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow, targetRow]);

      const result = await service.getEventParticipants(eventId, callerId);

      expect(prisma.eventAccess.findMany).toHaveBeenCalledWith(participantsLookup(eventId));
      expect(result).toEqual([
        { userId: callerId, name: "Jane Doe", accessLevel: AccessLevel.ORGANIZER },
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

      expect(result).toEqual([{ userId: callerId, name: "Jane Doe", accessLevel: AccessLevel.ORGANIZER }]);
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

      expect(result[0]).toEqual({
        userId: targetUserId,
        name: "Target User",
        accessLevel: AccessLevel.PARTICIPANT,
      });
      expect(result[0]).not.toHaveProperty("providerSub");
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getEventParticipants(eventId, callerId)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );

      expect(prisma.eventAccess.findMany).not.toHaveBeenCalled();
    });

    it("throws when the caller is unrelated to the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.getEventParticipants(eventId, otherUserId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId)),
      );

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
        include: eventAccessWithUserInclude,
      });
      expect(result).toEqual({
        userId: targetUserId,
        name: "Target User",
        accessLevel: AccessLevel.ORGANIZER,
      });
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
      ).rejects.toThrow(new UnprocessableEntityException(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(eventId)));

      expect(prisma.eventAccess.update).not.toHaveBeenCalled();
    });

    it("blocks the caller from modifying their own access level", async () => {
      setupOrganizerUpdate();

      await expect(service.updateUserAccessLevel(eventId, callerId, callerId, AccessLevel.PARTICIPANT)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.CANNOT_MODIFY_OWN_ACCESS),
      );

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

      await expect(service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );
    });

    it("throws when the target is not a member of the event", async () => {
      setupOrganizerUpdate();
      prisma.eventAccess.findUnique.mockResolvedValue(null);

      await expect(service.updateUserAccessLevel(eventId, callerId, targetUserId, AccessLevel.VIEWER)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, targetUserId)),
      );
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

      await expect(service.update(eventId, targetUserId, updateTitleDto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("removeUserFromEvent", () => {
    const setupOrganizerRemove = (targetAccess: EventAccess = targetParticipantAccess) => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [organizerAccess]));
      prisma.eventAccess.findUnique.mockResolvedValue(targetAccess);
    };

    it("removes a participant when the caller is an organizer", async () => {
      setupOrganizerRemove();
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).resolves.toBeUndefined();

      expect(prisma.eventAccess.delete).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: targetUserId, eventId } },
      });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.member.removed", eventId, callerId, targetUserId, audit: true },
        "Event member removed",
      );
    });

    it("removes a viewer when the caller is an organizer", async () => {
      setupOrganizerRemove({ ...targetParticipantAccess, accessLevel: AccessLevel.VIEWER });
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).resolves.toBeUndefined();
    });

    it("removes an organizer when another organizer remains", async () => {
      setupOrganizerRemove({ ...targetParticipantAccess, accessLevel: AccessLevel.ORGANIZER });
      prisma.eventAccess.count.mockResolvedValue(2);
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

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
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await service.removeUserFromEvent(eventWithAccessOnly.id, callerId, targetUserId);

      expect(prisma.eventAccess.delete).toHaveBeenCalled();
    });

    it("blocks removing the last organizer", async () => {
      setupOrganizerRemove({ ...targetParticipantAccess, accessLevel: AccessLevel.ORGANIZER });
      prisma.eventAccess.count.mockResolvedValue(1);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toThrow(
        new UnprocessableEntityException(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(eventId)),
      );

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("blocks self-removal via removeUserFromEvent", async () => {
      setupOrganizerRemove();

      await expect(service.removeUserFromEvent(eventId, callerId, callerId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.CANNOT_REMOVE_SELF),
      );

      expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
    });

    it("deletes only the target user event access row", async () => {
      setupOrganizerRemove();
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await service.removeUserFromEvent(eventId, callerId, targetUserId);

      expect(prisma.eventAccess.delete).toHaveBeenCalledTimes(1);
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("throws when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toThrow(NotFoundException);
    });

    it("throws when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, [participantAccess]));

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId)),
      );
    });

    it("throws when the target is not a member of the event", async () => {
      setupOrganizerRemove();
      prisma.eventAccess.findUnique.mockResolvedValue(null);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, targetUserId)),
      );
    });

    it("re-throws unexpected database errors when deleting event access", async () => {
      setupOrganizerRemove();
      const prismaError = new Error("Database connection lost");
      prisma.eventAccess.delete.mockRejectedValue(prismaError);

      await expect(service.removeUserFromEvent(eventId, callerId, targetUserId)).rejects.toThrow(prismaError);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("denies findOne for the removed target user", async () => {
      setupOrganizerRemove();
      prisma.eventAccess.delete.mockResolvedValue(targetParticipantAccess);

      await service.removeUserFromEvent(eventId, callerId, targetUserId);

      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(eventCreatedByUser, []));

      await expect(service.findOne(eventId, targetUserId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId)),
      );
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

      await expect(service.removeUserFromEvent(eventId, targetUserId, targetUserId)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.CANNOT_REMOVE_SELF),
      );
    });
  });
});
