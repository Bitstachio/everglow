import { accessibleBy } from "@casl/prisma";
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AccessLevel, Event, EventAccess, PrismaClient } from "generated/prisma/client";
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
import { eventWithCallerAccessInclude } from "./events.types";

const buildReadAccessibleWhere = (lookupUserId: string) => {
  const ability = new AbilityFactory().createForUser({ id: lookupUserId, isOnboarded: true });
  return accessibleBy(ability, EVENT_ACTIONS.READ).ofType(EVENT_SUBJECT);
};

const buildFindAllByCreatorWhere = (lookupUserId: string) => ({
  AND: [buildReadAccessibleWhere(lookupUserId), { creatorId: lookupUserId }],
});

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

  const eventId = eventCreatedByUser.id;
  const callerId = userId;

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
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          title: createEventDto.title,
          date: new Date(createEventDto.date),
          creatorId,
          invitationUrl: expect.any(String),
          ...creatorOrganizerAccessGrant,
        },
      });
      expect(prisma.event.create.mock.calls[0][0].data.invitationUrl).not.toBe("");
      expect(prisma.event.create.mock.calls[0][0].data.invitationUrl.length).toBeLessThanOrEqual(100);
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

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining(creatorOrganizerAccessGrant),
      });
    });

    it("creates an event with a description when description is provided", async () => {
      const eventWithDescription: Event = {
        ...createdEvent,
        description: createEventDtoWithDescription.description!,
      };
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.event.create.mockResolvedValue(eventWithDescription);

      const result = await service.create(creatorId, createEventDtoWithDescription);

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: createEventDtoWithDescription.title,
          description: createEventDtoWithDescription.description,
          date: new Date(createEventDtoWithDescription.date),
          creatorId,
          invitationUrl: expect.any(String),
        }),
      });
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

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          date: new Date("2026-08-15T18:00:00.000Z"),
        }),
      });
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

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          date: new Date("2026-08-15"),
        }),
      });
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

  describe("findAllByCreatorId", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
    });

    it("returns events created by the user", async () => {
      prisma.event.findMany.mockResolvedValue([eventCreatedByUser]);

      const result = await service.findAllByCreatorId(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildFindAllByCreatorWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(result).toEqual([eventCreatedByUser]);
    });

    it("returns an empty array when the user has created no events", async () => {
      prisma.event.findMany.mockResolvedValue([]);

      const result = await service.findAllByCreatorId(userId);

      expect(result).toEqual([]);
    });

    it("includes only events the user created and excludes events they joined without creating", async () => {
      prisma.event.findMany.mockResolvedValue([eventCreatedByUser]);

      await service.findAllByCreatorId(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildFindAllByCreatorWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(buildFindAllByCreatorWhere(userId).AND).toContainEqual({ creatorId: userId });
    });

    it("orders results by date ascending", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly, eventCreatedByUser]);

      await service.findAllByCreatorId(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: buildFindAllByCreatorWhere(userId),
        orderBy: { date: "asc" },
      });
    });

    it("returns an empty array when the user has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      const result = await service.findAllByCreatorId(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual([]);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it("re-throws unexpected database errors when loading created events", async () => {
      const prismaError = new Error("Query timeout");
      prisma.event.findMany.mockRejectedValue(prismaError);

      await expect(service.findAllByCreatorId(userId)).rejects.toThrow(prismaError);
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

  describe("listing created events vs all involved events", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
    });

    it("returns only created events when listing by creator and both created and joined events when listing all involvement", async () => {
      prisma.event.findMany
        .mockResolvedValueOnce([eventCreatedByUser])
        .mockResolvedValueOnce([eventWithAccessOnly, eventCreatedByUser]);

      const createdOnly = await service.findAllByCreatorId(userId);
      const allInvolved = await service.findAllForUser(userId);

      expect(createdOnly).toEqual([eventCreatedByUser]);
      expect(allInvolved).toEqual([eventWithAccessOnly, eventCreatedByUser]);
      expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
        where: buildFindAllByCreatorWhere(userId),
        orderBy: { date: "asc" },
      });
      expect(prisma.event.findMany).toHaveBeenNthCalledWith(2, {
        where: buildReadAccessibleWhere(userId),
        orderBy: { date: "asc" },
      });
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
});
