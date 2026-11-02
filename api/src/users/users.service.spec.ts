import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AccountDeletionPhotoPolicy, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { resolveApiErrorMessage } from "src/common/errors/api-error-codes";
import { ApiException } from "src/common/errors/api.exception";
import { PrismaService } from "src/prisma/prisma.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { ClaimedDeletion } from "./account-deletion-claim";
import { AccountDeletionOutboxService } from "./account-deletion-outbox.service";
import { AccountDeletionPreflightService } from "./account-deletion-preflight.service";
import { AccountDeletionPrepService } from "./account-deletion-prep.service";
import { AppleIdentityRevocationService } from "./apple-identity-revocation.service";
import { hashProviderSub } from "./deleted-provider-sub";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";

// Asserts the saga steps ran in order: prep → Auth0 → auth0 cleared → tombstone+delete tx.
const expectDeletionSagaOrder = (
  prepare: jest.Mock,
  deleteAuth0: jest.Mock,
  auth0Cleared: jest.Mock,
  transaction: jest.Mock,
): void => {
  // The irreversible step comes after the data is ready to be torn down.
  expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(deleteAuth0.mock.invocationCallOrder[0]);
  expect(deleteAuth0.mock.invocationCallOrder[0]).toBeLessThan(auth0Cleared.mock.invocationCallOrder[0]);
  expect(auth0Cleared.mock.invocationCallOrder[0]).toBeLessThan(transaction.mock.invocationCallOrder[0]);
};

describe("UsersService", () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;
  let auth0Management: DeepMockProxy<Auth0ManagementService>;
  let deletionPrep: { prepareRelatedData: jest.Mock };
  let appleRevocation: { revokeBeforeAuth0Delete: jest.Mock };
  let outbox: { drain: jest.Mock };
  let preflight: { assertCanFinish: jest.Mock };

  const providerSubHash = hashProviderSub("auth0|abc123");

  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

  /** A tombstone as the provision path loads it, with its carried bans. */
  const tombstone = (overrides: Record<string, unknown> = {}) =>
    ({ providerSubHash, formerUserId: userId, deletedAt: now, suspendedAt: null, bans: [], ...overrides }) as never;

  const createUserDetailsDto: CreateUserDetailsDto = {
    name: "Jane Doe",
    username: "jane.doe",
    acceptedTerms: true,
  };

  const userWithoutDetails: UserWithDetails = {
    id: userId,
    providerSub,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    deletionClaimedUntil: null,
    termsAcceptedAt: null,
    platformRole: null,
    suspendedAt: null,
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const userWithDetails: UserWithDetails = {
    id: userId,
    providerSub,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    deletionClaimedUntil: null,
    termsAcceptedAt: null,
    platformRole: null,
    suspendedAt: null,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId,
      username: "jane.doe",
      name: "Jane Doe",
      avatarS3Key: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  const uniqueConstraintError = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.8.0",
    });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    auth0Management = mockDeep<Auth0ManagementService>();
    deletionPrep = {
      prepareRelatedData: jest.fn().mockResolvedValue({
        summary: {
          eventsDeleted: 0,
          eventsHandedOver: 0,
          photosKept: 0,
          photosDeleted: 0,
          reportsClosed: 0,
          uploadsDiscarded: 0,
          avatarQueued: false,
        },
        events: [],
      }),
    };
    appleRevocation = { revokeBeforeAuth0Delete: jest.fn().mockResolvedValue("not_apple") };
    preflight = { assertCanFinish: jest.fn().mockResolvedValue(undefined) };
    outbox = { drain: jest.fn().mockResolvedValue({ done: 0, failed: 0, givenUp: 0 }) };
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.reportEvidence.updateMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: Auth0ManagementService,
          useValue: auth0Management,
        },
        {
          provide: AccountDeletionPrepService,
          useValue: deletionPrep,
        },
        {
          provide: AppleIdentityRevocationService,
          useValue: appleRevocation,
        },
        {
          provide: AccountDeletionPreflightService,
          useValue: preflight,
        },
        {
          provide: AccountDeletionOutboxService,
          useValue: outbox,
        },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createDetails", () => {
    it("creates user details when the user exists and has not onboarded", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.user.update.mockResolvedValue(userWithDetails);

      const result = await service.createDetails(userId, createUserDetailsDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(prisma.userDetails.count).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          termsAcceptedAt: expect.any(Date) as unknown,
          details: {
            create: {
              username: createUserDetailsDto.username,
              name: createUserDetailsDto.name,
            },
          },
        },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(userWithDetails);
    });

    it("records when the terms were accepted", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue({ ...userWithDetails, termsAcceptedAt: now });

      await service.createDetails(userId, createUserDetailsDto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ termsAcceptedAt: expect.any(Date) as unknown }) as unknown,
        }),
      );
    });

    it("throws ApiException when the user has already completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toMatchObject({
        response: {
          code: "DETAILS_ALREADY_EXIST",
          message: resolveApiErrorMessage("DETAILS_ALREADY_EXIST"),
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws ApiException when the username is reserved", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.createDetails(userId, { ...createUserDetailsDto, username: "admin" })).rejects.toMatchObject(
        {
          response: {
            code: "USERNAME_RESERVED",
            message: resolveApiErrorMessage("USERNAME_RESERVED", { username: "admin" }),
          },
        },
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws ApiException when username create loses a uniqueness race", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.user.update.mockRejectedValue(uniqueConstraintError());

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toMatchObject({
        response: {
          code: "USERNAME_TAKEN",
          message: resolveApiErrorMessage("USERNAME_TAKEN", { username: "jane.doe" }),
        },
      });
    });

    it("rethrows unexpected Prisma errors from user.update", async () => {
      const prismaError = new Error("Database connection lost");
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.user.update.mockRejectedValue(prismaError);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toThrow(prismaError);
    });
  });

  describe("getById", () => {
    it("returns the user when found", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);

      const result = await service.getById(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(userWithDetails);
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getById(userId)).rejects.toThrow(NotFoundException);
    });

    it("rethrows unexpected Prisma errors from user.findUnique", async () => {
      const prismaError = new Error("Query timeout");
      prisma.user.findUnique.mockRejectedValue(prismaError);

      await expect(service.getById(userId)).rejects.toThrow(prismaError);
    });
  });

  describe("getOnboardedById", () => {
    it("returns the user once onboarding is complete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);

      await expect(service.getOnboardedById(userId)).resolves.toEqual(userWithDetails);
    });

    it("throws ApiException when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.getOnboardedById(userId)).rejects.toMatchObject({
        response: {
          code: "ONBOARDING_INCOMPLETE",
          message: resolveApiErrorMessage("ONBOARDING_INCOMPLETE"),
        },
      });
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getOnboardedById(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    const updateDto: UpdateUserDto = {
      name: "Jane Smith",
      username: "jane.smith",
    };

    const updatedUser: UserWithDetails = {
      ...userWithDetails,
      details: {
        ...userWithDetails.details!,
        name: updateDto.name!,
        username: updateDto.username!,
      },
    };

    beforeEach(() => {
      // The update runs in one interactive transaction, against the same mock client.
      prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
      prisma.usernameChange.findMany.mockResolvedValue([]);
    });

    describe("username change limit", () => {
      const day = 24 * 60 * 60 * 1000;

      it("records a real username change with the old and new handle, after locking the user's row", async () => {
        prisma.user.findUnique.mockResolvedValue(userWithDetails);
        prisma.user.update.mockResolvedValue(updatedUser);

        await service.update(userId, { username: "jane.smith" });

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        expect(prisma.usernameChange.create).toHaveBeenCalledWith({
          data: { userId, oldUsername: userWithDetails.details!.username, newUsername: "jane.smith" },
        });
        expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.usernameChange.create.mock.invocationCallOrder[0],
        );
      });

      it("counts only changes inside the 14-day window", async () => {
        prisma.user.findUnique.mockResolvedValue(userWithDetails);
        prisma.user.update.mockResolvedValue(updatedUser);
        jest.useFakeTimers({ now: new Date("2026-06-20T12:00:00.000Z") });
        try {
          await service.update(userId, { username: "jane.smith" });
        } finally {
          jest.useRealTimers();
        }

        expect(prisma.usernameChange.findMany).toHaveBeenCalledWith({
          where: { userId, changedAt: { gt: new Date("2026-06-06T12:00:00.000Z") } },
          orderBy: { changedAt: "asc" },
          select: { changedAt: true },
          take: 2,
        });
      });

      it("refuses a third change within 14 days with a coded 429 and changes nothing", async () => {
        const oldest = new Date(Date.now() - 3 * day);
        prisma.user.findUnique.mockResolvedValue(userWithDetails);
        prisma.usernameChange.findMany.mockResolvedValue([
          { changedAt: oldest },
          { changedAt: new Date(Date.now() - day) },
        ] as never);

        const failure = await service.update(userId, { username: "jane.smith" }).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(ApiException);
        expect((failure as ApiException).getStatus()).toBe(429);
        expect((failure as ApiException).getResponse()).toEqual({
          code: "USERNAME_CHANGE_LIMITED",
          message: resolveApiErrorMessage("USERNAME_CHANGE_LIMITED", {
            availableAt: new Date(oldest.getTime() + 14 * day),
          }),
        });
        expect(prisma.usernameChange.create).not.toHaveBeenCalled();
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it("does not count saving the username the user already has", async () => {
        prisma.user.findUnique.mockResolvedValue(userWithDetails);
        prisma.user.update.mockResolvedValue(userWithDetails);

        await service.update(userId, { username: userWithDetails.details!.username.toUpperCase() });

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.usernameChange.create).not.toHaveBeenCalled();
      });

      it("does not count a name-only update, even when the limit is reached", async () => {
        prisma.user.findUnique.mockResolvedValue(userWithDetails);
        prisma.usernameChange.findMany.mockResolvedValue([
          { changedAt: new Date() },
          { changedAt: new Date() },
        ] as never);
        prisma.user.update.mockResolvedValue(userWithDetails);

        await expect(service.update(userId, { name: "Jane Smith" })).resolves.toBeDefined();
        expect(prisma.usernameChange.create).not.toHaveBeenCalled();
      });
    });

    describe("usernameChangeAvailableAt", () => {
      const day = 24 * 60 * 60 * 1000;

      it("is null while the user has changes left", async () => {
        prisma.usernameChange.findMany.mockResolvedValue([{ changedAt: new Date() }] as never);

        await expect(service.usernameChangeAvailableAt(userId)).resolves.toBeNull();
      });

      it("is when the oldest change in the window ages out, once the limit is reached", async () => {
        const oldest = new Date(Date.now() - 5 * day);
        prisma.usernameChange.findMany.mockResolvedValue([
          { changedAt: oldest },
          { changedAt: new Date(Date.now() - day) },
        ] as never);

        await expect(service.usernameChangeAvailableAt(userId)).resolves.toEqual(new Date(oldest.getTime() + 14 * day));
      });
    });

    it("updates user details when onboarding is complete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, updateDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(prisma.userDetails.count).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          details: {
            update: updateDto,
          },
        },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(updatedUser);
    });

    it("updates user details when only name is provided", async () => {
      const nameOnlyDto: UpdateUserDto = { name: "Jane Smith" };
      const nameUpdatedUser: UserWithDetails = {
        ...userWithDetails,
        details: {
          ...userWithDetails.details!,
          name: nameOnlyDto.name!,
        },
      };
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.user.update.mockResolvedValue(nameUpdatedUser);

      const result = await service.update(userId, nameOnlyDto);

      expect(prisma.userDetails.count).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          details: {
            update: nameOnlyDto,
          },
        },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(nameUpdatedUser);
    });

    it("throws ApiException when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.update(userId, updateDto)).rejects.toMatchObject({
        response: {
          code: "ONBOARDING_INCOMPLETE",
          message: resolveApiErrorMessage("ONBOARDING_INCOMPLETE"),
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, updateDto)).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rethrows unexpected Prisma errors from user.update", async () => {
      const prismaError = new Error("Unique constraint failed");
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.user.update.mockRejectedValue(prismaError);

      await expect(service.update(userId, updateDto)).rejects.toThrow(prismaError);
    });

    it("throws ApiException when username update loses a uniqueness race", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.user.update.mockRejectedValue(uniqueConstraintError());

      await expect(service.update(userId, { username: "taken.name" })).rejects.toMatchObject({
        response: {
          code: "USERNAME_TAKEN",
          message: resolveApiErrorMessage("USERNAME_TAKEN", { username: "taken.name" }),
        },
      });
    });
  });

  describe("checkUsernameAvailability", () => {
    it("returns INVALID_FORMAT for too-short usernames, with no suggestions", async () => {
      await expect(service.checkUsernameAvailability(userId, "ab")).resolves.toEqual({
        username: "ab",
        available: false,
        reason: "INVALID_FORMAT",
        suggestions: [],
      });
      expect(prisma.userDetails.findFirst).not.toHaveBeenCalled();
      expect(prisma.userDetails.findMany).not.toHaveBeenCalled();
    });

    it("returns RESERVED for reserved usernames, with free alternatives", async () => {
      prisma.userDetails.findMany.mockResolvedValue([]);

      const result = await service.checkUsernameAvailability(userId, "Admin");

      expect(result).toMatchObject({ username: "admin", available: false, reason: "RESERVED" });
      expect(result.suggestions).toHaveLength(4);
      expect(result.suggestions.every((name) => name.startsWith("admin") && name !== "admin")).toBe(true);
      expect(prisma.userDetails.findFirst).not.toHaveBeenCalled();
    });

    it("returns TAKEN when another user holds the username, suggesting free names from the name", async () => {
      prisma.userDetails.findFirst.mockResolvedValue({ userId: "other-user" } as never);
      prisma.userDetails.findMany.mockResolvedValue([{ username: "maya.chen" }] as never);

      const result = await service.checkUsernameAvailability(userId, "Maya", "Maya Chen");

      expect(result).toMatchObject({ username: "maya", available: false, reason: "TAKEN" });
      expect(result.suggestions).toEqual([
        "mayachen",
        "maya_c",
        expect.stringMatching(/^maya\.c\d\d$/),
        expect.stringMatching(/^maya\.\d\d$/),
      ]);
      expect(prisma.userDetails.findFirst).toHaveBeenCalledWith({
        where: { username: "maya", NOT: { userId } },
        select: { userId: true },
      });
      expect(prisma.userDetails.findMany).toHaveBeenCalledWith({
        where: { username: { in: expect.arrayContaining(["maya.chen", "mayachen"]) as string[] }, NOT: { userId } },
        select: { username: true },
      });
    });

    it("returns available when the caller already owns the username", async () => {
      prisma.userDetails.findFirst.mockResolvedValue(null);

      await expect(service.checkUsernameAvailability(userId, "jane.doe")).resolves.toEqual({
        username: "jane.doe",
        available: true,
        reason: null,
        suggestions: [],
      });
      expect(prisma.userDetails.findMany).not.toHaveBeenCalled();
    });
  });

  describe("completeAccountDeletion", () => {
    const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
    const auth0DeletedAt = new Date("2026-06-10T12:02:00.000Z");

    const claimedUntil = new Date("2026-06-10T12:06:00.000Z");
    /** A row this pass has claimed, as claimDeletionForRequest or the reconciler return it. */
    const claimed = (overrides: Partial<ClaimedDeletion> = {}): ClaimedDeletion => ({
      id: userId,
      providerSub,
      deletionStartedAt,
      auth0DeletedAt: null,
      deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP,
      deletionAttempts: 0,
      deletionClaimedUntil: claimedUntil,
      ...overrides,
    });
    const freshDeletionUser = () => claimed();

    beforeEach(() => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      // Still there after a failure: the claim is given back, not a vanished row.
      prisma.user.findUnique.mockResolvedValue({ id: userId } as never);
    });

    const expectTombstoneThenDelete = (): void => {
      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalledWith({
        where: { providerSubHash },
        create: { providerSubHash, formerUserId: userId, suspendedAt: null },
        // deletedAt is refreshed: a subject that registered again and deleted
        // again must be judged against the later deletion, not the first.
        update: { formerUserId: userId, deletedAt: expect.any(Date) as Date, suspendedAt: null },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
      expect(prisma.deletedProviderSub.upsert.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.delete.mock.invocationCallOrder[0],
      );
    };

    it("runs prep → Auth0 → auth0 cleared → tombstone+delete in order", async () => {
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
        suspendedAt: null,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await expect(service.completeAccountDeletion(freshDeletionUser())).resolves.toBe("deleted");

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: userId },
        data: { auth0DeletedAt: expect.any(Date) as Date },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expectTombstoneThenDelete();
      expectDeletionSagaOrder(
        deletionPrep.prepareRelatedData,
        auth0Management.deleteUser,
        prisma.user.updateMany,
        prisma.$transaction,
      );
    });

    describe("carrying sanctions over", () => {
      const suspendedAt = new Date("2026-06-01T09:00:00.000Z");
      const bannedAt = new Date("2026-05-20T09:00:00.000Z");
      const eventId = "33333333-3333-3333-3333-333333333333";
      const resumedUser = () => claimed({ auth0DeletedAt });

      beforeEach(() => {
        prisma.user.delete.mockResolvedValue(userWithDetails);
      });

      it("writes the account's suspension and event bans onto the tombstone, under a lock on the row", async () => {
        prisma.user.findUnique.mockResolvedValue({
          suspendedAt,
          eventBans: [{ eventId, createdAt: bannedAt }],
        } as never);

        await service.completeAccountDeletion(resumedUser());

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.user.findUnique.mock.invocationCallOrder[0],
        );
        expect(prisma.deletedProviderSub.upsert).toHaveBeenCalledWith({
          where: { providerSubHash },
          create: { providerSubHash, formerUserId: userId, suspendedAt },
          update: { formerUserId: userId, deletedAt: expect.any(Date) as Date, suspendedAt },
        });
        // An earlier deletion's bans are replaced, not merged.
        expect(prisma.carriedBan.deleteMany).toHaveBeenCalledWith({ where: { providerSubHash } });
        expect(prisma.carriedBan.createMany).toHaveBeenCalledWith({
          data: [{ providerSubHash, eventId, bannedAt }],
          skipDuplicates: true,
        });
        expect(prisma.carriedBan.createMany.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.user.delete.mock.invocationCallOrder[0],
        );
      });

      it("clears the tombstone's suspension and bans when the account has none", async () => {
        prisma.user.findUnique.mockResolvedValue({ suspendedAt: null, eventBans: [] } as never);

        await service.completeAccountDeletion(resumedUser());

        expectTombstoneThenDelete();
        expect(prisma.carriedBan.deleteMany).toHaveBeenCalledWith({ where: { providerSubHash } });
        expect(prisma.carriedBan.createMany).not.toHaveBeenCalled();
      });
    });

    it("revokes the Apple token before the Auth0 user is deleted, on every pass that still has one", async () => {
      appleRevocation.revokeBeforeAuth0Delete.mockResolvedValue("revoked");
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(freshDeletionUser());

      expect(appleRevocation.revokeBeforeAuth0Delete).toHaveBeenCalledWith(userId, providerSub);
      // The token lives on the Auth0 user; once that is gone there is nothing left to revoke.
      expect(appleRevocation.revokeBeforeAuth0Delete.mock.invocationCallOrder[0]).toBeLessThan(
        auth0Management.deleteUser.mock.invocationCallOrder[0],
      );
      // And nothing irreversible happens before prep has settled the data.
      expect(deletionPrep.prepareRelatedData.mock.invocationCallOrder[0]).toBeLessThan(
        appleRevocation.revokeBeforeAuth0Delete.mock.invocationCallOrder[0],
      );
    });

    it("skips Apple revocation once Auth0 is already cleared", async () => {
      const auth0ClearedUser = claimed({ auth0DeletedAt });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(auth0ClearedUser);

      expect(appleRevocation.revokeBeforeAuth0Delete).not.toHaveBeenCalled();
    });

    it("leaves the Auth0 user in place when Apple revocation fails in a retryable way", async () => {
      const outage = new Error("Apple unreachable");
      appleRevocation.revokeBeforeAuth0Delete.mockRejectedValue(outage);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toBe(outage);

      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
      // Intent stays stamped so the reconciler retries with the token still in Auth0.
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("resumes mid-saga: retries Auth0, then tombstones and deletes", async () => {
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
        suspendedAt: null,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(claimed({ deletionAttempts: 2 }));

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(auth0Management.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.updateMany.mock.invocationCallOrder[0],
      );
      expectTombstoneThenDelete();
    });

    it("skips Auth0 and only tombstones+deletes when auth0DeletedAt is already set", async () => {
      const auth0ClearedUser = claimed({ auth0DeletedAt });
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
        suspendedAt: null,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(auth0ClearedUser);

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expectTombstoneThenDelete();
    });

    it("upserts an existing tombstone so reconciler retries stay idempotent", async () => {
      const auth0ClearedUser = claimed({ auth0DeletedAt });
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
        suspendedAt: null,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(auth0ClearedUser);

      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalledWith({
        where: { providerSubHash },
        create: { providerSubHash, formerUserId: userId, suspendedAt: null },
        // deletedAt is refreshed: a subject that registered again and deleted
        // again must be judged against the later deletion, not the first.
        update: { formerUserId: userId, deletedAt: expect.any(Date) as Date, suspendedAt: null },
      });
    });

    it("leaves the Auth0 identity alone when prep fails, so a retryable error costs no login", async () => {
      const prepError = new Error("prep failed");
      deletionPrep.prepareRelatedData.mockRejectedValue(prepError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(prepError);

      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.deletedProviderSub.upsert).not.toHaveBeenCalled();
    });

    it("prepares with the photo choice stored when the saga started", async () => {
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(claimed({ deletionPhotoPolicy: AccountDeletionPhotoPolicy.DELETE }));

      expect(deletionPrep.prepareRelatedData).toHaveBeenCalledWith(userId, AccountDeletionPhotoPolicy.DELETE);
    });

    it("falls back to KEEP for a row that somehow carries no choice", async () => {
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(claimed({ deletionPhotoPolicy: null }));

      expect(deletionPrep.prepareRelatedData).toHaveBeenCalledWith(userId, AccountDeletionPhotoPolicy.KEEP);
    });

    it("drains the objects prep queued right after prep, before Apple or Auth0 can fail", async () => {
      auth0Management.deleteUser.mockRejectedValue(new Error("Auth0 down"));

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow("Auth0 down");

      expect(outbox.drain).toHaveBeenCalledWith({ userId });
      expect(deletionPrep.prepareRelatedData.mock.invocationCallOrder[0]).toBeLessThan(
        outbox.drain.mock.invocationCallOrder[0],
      );
      expect(outbox.drain.mock.invocationCallOrder[0]).toBeLessThan(
        auth0Management.deleteUser.mock.invocationCallOrder[0],
      );
    });

    it("never stores the raw subject in the tombstone", async () => {
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(freshDeletionUser());

      const [args] = prisma.deletedProviderSub.upsert.mock.calls[0];
      expect(JSON.stringify(args)).not.toContain(providerSub);
    });

    it("scrubs the account's username off report evidence, except under a child-safety or law-enforcement hold", async () => {
      prisma.user.delete.mockResolvedValue(userWithDetails);
      prisma.reportEvidence.updateMany.mockResolvedValue({ count: 2 });

      await service.completeAccountDeletion(claimed({ auth0DeletedAt }));

      expect(prisma.reportEvidence.updateMany).toHaveBeenCalledWith({
        where: {
          subjectUserId: userId,
          subjectUsername: { not: null },
          report: {
            OR: [
              { holdReason: null },
              { holdReason: { notIn: ["CHILD_SAFETY", "LAW_ENFORCEMENT"] } },
              { holdUntil: null },
              { holdUntil: { lte: expect.any(Date) as Date } },
            ],
          },
        },
        data: { subjectUsername: null },
      });
      // In the transaction that deletes the row, so the two can't come apart.
      expect(prisma.reportEvidence.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.delete.mock.invocationCallOrder[0],
      );
    });

    it("does not delete the user when Auth0 fails after intent is stamped", async () => {
      const auth0Error = new Error("Auth0 Management API unavailable");
      auth0Management.deleteUser.mockRejectedValue(auth0Error);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(auth0Error);

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("does not delete the user when stamping auth0DeletedAt fails after Auth0 succeeds", async () => {
      const stampError = new Error("Database write failed");
      prisma.user.updateMany.mockRejectedValueOnce(stampError);
      auth0Management.deleteUser.mockResolvedValue(undefined);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(stampError);

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("does not delete the user when tombstone upsert fails inside the transaction", async () => {
      const tombstoneError = new Error("Tombstone write failed");
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockRejectedValue(tombstoneError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(tombstoneError);

      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("rethrows when user delete fails after the tombstone is written", async () => {
      const prismaError = new Error("Foreign key constraint violation");
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
        suspendedAt: null,
      });
      prisma.user.delete.mockRejectedValue(prismaError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(prismaError);

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalled();
    });

    it("gives its claim back after a failed pass, so the person can retry at once", async () => {
      auth0Management.deleteUser.mockRejectedValue(new Error("Auth0 down"));

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow("Auth0 down");

      // releaseDeletionClaim: the only raw statement on this path.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      expect(strings.join("?")).toContain('SET "deletionClaimedUntil" = NULL');
      expect(values).toContain(userId);
    });

    it("counts a row another pass deleted first as done, not as a failure", async () => {
      prisma.user.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Record to delete does not exist", {
          code: "P2025",
          clientVersion: "7.8.0",
        }),
      );
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.completeAccountDeletion(claimed({ auth0DeletedAt }))).resolves.toBe("vanished");
    });

    it("stops quietly when the row vanished while Auth0 was being deleted", async () => {
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.completeAccountDeletion(freshDeletionUser())).resolves.toBe("vanished");
      expect(prisma.deletedProviderSub.upsert).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    const claimRow = (overrides: Partial<ClaimedDeletion> = {}): ClaimedDeletion => ({
      id: userId,
      providerSub,
      deletionStartedAt: now,
      auth0DeletedAt: null,
      deletionPhotoPolicy: AccountDeletionPhotoPolicy.DELETE,
      deletionAttempts: 0,
      deletionClaimedUntil: new Date(now.getTime() + 300_000),
      ...overrides,
    });

    it("checks the deletion can finish, then claims the row and runs the saga", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.$queryRaw.mockResolvedValue([claimRow()]);
      const completeSpy = jest.spyOn(service, "completeAccountDeletion").mockResolvedValue("deleted");

      await service.remove(userId, AccountDeletionPhotoPolicy.DELETE);

      expect(preflight.assertCanFinish).toHaveBeenCalledWith(userWithDetails);
      expect(preflight.assertCanFinish.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$queryRaw.mock.invocationCallOrder[0],
      );
      expect(completeSpy).toHaveBeenCalledWith(claimRow());
      completeSpy.mockRestore();
    });

    it("writes nothing when the deletion could not finish", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      preflight.assertCanFinish.mockRejectedValue(new ApiException("ACCOUNT_DELETION_UNAVAILABLE"));

      await expect(service.remove(userId, AccountDeletionPhotoPolicy.KEEP)).rejects.toMatchObject({
        code: "ACCOUNT_DELETION_UNAVAILABLE",
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(deletionPrep.prepareRelatedData).not.toHaveBeenCalled();
    });

    it("answers ACCOUNT_DELETION_IN_PROGRESS while another pass holds the claim", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...userWithDetails, deletionStartedAt: now });
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.remove(userId, AccountDeletionPhotoPolicy.KEEP)).rejects.toMatchObject({
        code: "ACCOUNT_DELETION_IN_PROGRESS",
      });
      expect(deletionPrep.prepareRelatedData).not.toHaveBeenCalled();
    });

    it("succeeds when another pass finished the deletion before this one could claim it", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(userWithDetails).mockResolvedValueOnce(null);
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.remove(userId, AccountDeletionPhotoPolicy.KEEP)).resolves.toBeUndefined();
      expect(deletionPrep.prepareRelatedData).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove(userId, AccountDeletionPhotoPolicy.KEEP)).rejects.toThrow(NotFoundException);
    });
  });

  describe("resolveByProviderSub", () => {
    it("returns the existing user when found by providerSub", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);

      const result = await service.resolveByProviderSub(providerSub);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { providerSub },
        include: userWithDetailsInclude,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result).toEqual(userWithDetails);
    });

    it("returns a user whose deletion is in progress, for the guard to refuse", async () => {
      const deleting = { ...userWithDetails, deletionStartedAt: new Date("2026-06-10T12:01:00.000Z") };
      prisma.user.findUnique.mockResolvedValue(deleting);

      await expect(service.resolveByProviderSub(providerSub)).resolves.toEqual(deleting);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("creates a new user when no record and no tombstone exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(userWithoutDetails);

      const result = await service.resolveByProviderSub(providerSub);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { providerSub },
        include: userWithDetailsInclude,
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.deletedProviderSub.findUnique).toHaveBeenCalledWith({
        where: { providerSubHash },
        include: { bans: { select: { eventId: true, bannedAt: true } } },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { providerSub },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(userWithoutDetails);
    });

    it("provisions a fresh account when the token was issued after the deletion", async () => {
      // A social sub survives an Auth0 delete and re-signup, so the tombstone
      // must block the old tokens without banning the person for good.
      const deletedAt = new Date("2026-06-10T12:00:00.000Z");
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(tombstone({ deletedAt }));
      prisma.user.create.mockResolvedValue(userWithoutDetails);

      const result = await service.resolveByProviderSub(providerSub, deletedAt.getTime() / 1000 + 600);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { providerSub },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(userWithoutDetails);
    });

    describe("after a deletion with sanctions", () => {
      const deletedAt = new Date("2026-06-10T12:00:00.000Z");
      const afterDeletion = deletedAt.getTime() / 1000 + 600;
      const suspendedAt = new Date("2026-06-01T09:00:00.000Z");
      const bannedAt = new Date("2026-05-20T09:00:00.000Z");
      const eventId = "33333333-3333-3333-3333-333333333333";
      const newUserId = "55555555-5555-5555-5555-555555555555";

      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({ ...userWithoutDetails, id: newUserId, suspendedAt });
      });

      it("creates the new account already suspended and clears the suspension off the tombstone", async () => {
        prisma.deletedProviderSub.findUnique.mockResolvedValue(tombstone({ deletedAt, suspendedAt }));

        const result = await service.resolveByProviderSub(providerSub, afterDeletion);

        expect(result.suspendedAt).toEqual(suspendedAt);
        expect(prisma.user.create).toHaveBeenCalledWith({
          data: { providerSub, suspendedAt },
          include: userWithDetailsInclude,
        });
        expect(prisma.deletedProviderSub.update).toHaveBeenCalledWith({
          where: { providerSubHash },
          data: { suspendedAt: null },
        });
        expect(prisma.eventBan.createMany).not.toHaveBeenCalled();
      });

      it("re-creates the carried event bans for the new account and removes them from the tombstone", async () => {
        prisma.deletedProviderSub.findUnique.mockResolvedValue(tombstone({ deletedAt, bans: [{ eventId, bannedAt }] }));

        await service.resolveByProviderSub(providerSub, afterDeletion);

        expect(prisma.user.create).toHaveBeenCalledWith({ data: { providerSub }, include: userWithDetailsInclude });
        expect(prisma.eventBan.createMany).toHaveBeenCalledWith({
          data: [{ eventId, userId: newUserId, createdAt: bannedAt }],
          skipDuplicates: true,
        });
        expect(prisma.carriedBan.deleteMany).toHaveBeenCalledWith({ where: { providerSubHash } });
        expect(prisma.deletedProviderSub.update).not.toHaveBeenCalled();
      });

      it("touches nothing else when the tombstone carries no sanction", async () => {
        prisma.deletedProviderSub.findUnique.mockResolvedValue(tombstone({ deletedAt }));

        await service.resolveByProviderSub(providerSub, afterDeletion);

        expect(prisma.eventBan.createMany).not.toHaveBeenCalled();
        expect(prisma.carriedBan.deleteMany).not.toHaveBeenCalled();
        expect(prisma.deletedProviderSub.update).not.toHaveBeenCalled();
      });

      it("carries nothing over to a leftover token, which is refused", async () => {
        prisma.deletedProviderSub.findUnique.mockResolvedValue(
          tombstone({ deletedAt, suspendedAt, bans: [{ eventId, bannedAt }] }),
        );

        await expect(service.resolveByProviderSub(providerSub, afterDeletion - 600)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(prisma.eventBan.createMany).not.toHaveBeenCalled();
      });
    });

    it("refuses a token issued inside the clock-skew margin after the deletion", async () => {
      // Auth0's clock against ours: five minutes either side is not proof of a new sign-in.
      const deletedAt = new Date("2026-06-10T12:00:00.000Z");
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(tombstone({ deletedAt }));

      await expect(service.resolveByProviderSub(providerSub, deletedAt.getTime() / 1000 + 120)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("refuses a tombstoned subject whose token predates the deletion", async () => {
      const deletedAt = new Date("2026-06-10T12:00:00.000Z");
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(tombstone({ deletedAt }));

      await expect(service.resolveByProviderSub(providerSub, deletedAt.getTime() / 1000 - 60)).rejects.toThrow(
        new UnauthorizedException(
          RESPONSE_TEMPLATES.TOKEN_REJECTED("the token was issued before this identity's account was deleted"),
        ),
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects JIT create when a tombstone exists for the providerSub", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
        suspendedAt: null,
      });

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(
        new UnauthorizedException(
          RESPONSE_TEMPLATES.TOKEN_REJECTED("the token was issued before this identity's account was deleted"),
        ),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("returns the winner when JIT create loses a unique race to another provision", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(userWithoutDetails);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      const result = await service.resolveByProviderSub(providerSub);

      expect(result).toEqual(userWithoutDetails);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it("returns a mid-deletion user a unique race resolves to, for the guard to refuse", async () => {
      const deleting = { ...userWithDetails, deletionStartedAt: new Date("2026-06-10T12:01:00.000Z") };
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(deleting);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.resolveByProviderSub(providerSub)).resolves.toEqual(deleting);
    });

    it("rejects when a unique race finds no user but a tombstone now exists", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
        suspendedAt: null,
      });
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(
        new UnauthorizedException(
          RESPONSE_TEMPLATES.TOKEN_REJECTED("the token was issued before this identity's account was deleted"),
        ),
      );
    });

    it("rejects when a unique race finds neither user nor tombstone", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(
        new UnauthorizedException(
          RESPONSE_TEMPLATES.TOKEN_REJECTED(
            "creating this identity's account conflicted, and the account was gone on re-read",
          ),
        ),
      );
    });

    it("rethrows unexpected Prisma errors from user.findUnique", async () => {
      const prismaError = new Error("Connection refused");
      prisma.user.findUnique.mockRejectedValue(prismaError);

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(prismaError);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rethrows unexpected Prisma errors from user.create during JIT provisioning", async () => {
      const prismaError = new Error("Insert failed");
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(prismaError);

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(prismaError);
    });

    it("rethrows unexpected errors from the provision transaction itself", async () => {
      const txError = new Error("Transaction aborted");
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(txError);

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(txError);
    });
  });
});
