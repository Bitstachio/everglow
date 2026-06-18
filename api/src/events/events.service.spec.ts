import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Event, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { UserWithDetails, userWithDetailsInclude } from "src/users/users.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { EVENT_SERVICE_ERRORS } from "./events.constants";
import { EventsService } from "./events.service";

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

  const findAllForUserQuery = {
    where: {
      OR: [{ creatorId: userId }, { eventAccesses: { some: { userId } } }],
    },
    orderBy: { date: "asc" as const },
  };

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
        where: { creatorId: userId },
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
        where: { creatorId: userId },
        orderBy: { date: "asc" },
      });
      expect(prisma.event.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it("orders results by date ascending", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly, eventCreatedByUser]);

      await service.findAllByCreatorId(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { creatorId: userId },
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

      expect(prisma.event.findMany).toHaveBeenCalledWith(findAllForUserQuery);
      expect(result).toEqual([eventCreatedByUser]);
    });

    it("returns events where the user is an organizer", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith(findAllForUserQuery);
      expect(result).toEqual([eventWithAccessOnly]);
    });

    it("returns events where the user is a participant", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith(findAllForUserQuery);
      expect(result).toEqual([eventWithAccessOnly]);
    });

    it("returns events where the user is a viewer", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly]);

      const result = await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith(findAllForUserQuery);
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

      expect(prisma.event.findMany).toHaveBeenCalledWith(findAllForUserQuery);
      expect(result).toEqual([eventCreatedByUser]);
      expect(result).toHaveLength(1);
    });

    it("orders results by date ascending", async () => {
      prisma.event.findMany.mockResolvedValue([eventWithAccessOnly, eventCreatedByUser]);

      await service.findAllForUser(userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith(findAllForUserQuery);
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
        where: { creatorId: userId },
        orderBy: { date: "asc" },
      });
      expect(prisma.event.findMany).toHaveBeenNthCalledWith(2, findAllForUserQuery);
    });
  });
});
