import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AccountDeletionPhotoPolicy, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { AccountDeletionPrepService } from "./account-deletion-prep.service";
import { AppleIdentityRevocationService } from "./apple-identity-revocation.service";
import { hashProviderSub } from "./deleted-provider-sub";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { USER_SERVICE_ERRORS, USERNAME_TAKEN_CODE } from "./users.constants";
import { AccountDeletionUser, UsersService } from "./users.service";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";

// Asserts the saga steps ran in order: intent → prep → Auth0 → auth0 cleared → tombstone+delete tx.
const expectDeletionSagaOrder = (
  userUpdate: jest.Mock,
  prepare: jest.Mock,
  deleteAuth0: jest.Mock,
  transaction: jest.Mock,
): void => {
  expect(userUpdate.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0]);
  // The irreversible step comes after the data is ready to be torn down.
  expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(deleteAuth0.mock.invocationCallOrder[0]);
  expect(deleteAuth0.mock.invocationCallOrder[0]).toBeLessThan(userUpdate.mock.invocationCallOrder[1]);
  expect(userUpdate.mock.invocationCallOrder[1]).toBeLessThan(transaction.mock.invocationCallOrder[0]);
};

describe("UsersService", () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;
  let auth0Management: DeepMockProxy<Auth0ManagementService>;
  let deletionPrep: { prepareRelatedData: jest.Mock };
  let appleRevocation: { revokeBeforeAuth0Delete: jest.Mock };
  let photoPurge: { purgeObjects: jest.Mock };

  const providerSubHash = hashProviderSub("auth0|abc123");

  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const createUserDetailsDto: CreateUserDetailsDto = {
    name: "Jane Doe",
    username: "jane.doe",
  };

  const userWithoutDetails: UserWithDetails = {
    id: userId,
    providerSub,
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
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
    id: userId,
    providerSub,
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    termsAcceptedAt: null,
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
        s3Keys: [],
      }),
    };
    appleRevocation = { revokeBeforeAuth0Delete: jest.fn().mockResolvedValue("not_apple") };
    photoPurge = { purgeObjects: jest.fn().mockResolvedValue({ requested: 0, deleted: 0, failed: 0 }) };
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));

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
          provide: PhotoPurgeService,
          useValue: photoPurge,
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

    it("records when the terms were accepted if the client sends acceptedTerms", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue({ ...userWithDetails, termsAcceptedAt: now });

      await service.createDetails(userId, { ...createUserDetailsDto, acceptedTerms: true });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ termsAcceptedAt: expect.any(Date) as unknown }) as unknown,
        }),
      );
    });

    it("leaves termsAcceptedAt untouched for a client that does not send acceptedTerms yet", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue(userWithDetails);

      await service.createDetails(userId, createUserDetailsDto);

      const [args] = prisma.user.update.mock.calls[0];
      expect(args.data).not.toHaveProperty("termsAcceptedAt");
    });

    it("throws ConflictException when the user has already completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toThrow(
        new ConflictException(USER_SERVICE_ERRORS.DETAILS_ALREADY_EXIST(userId)),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId)),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when the username is reserved", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.createDetails(userId, { ...createUserDetailsDto, username: "admin" })).rejects.toThrow(
        new BadRequestException(USER_SERVICE_ERRORS.USERNAME_RESERVED("admin")),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws coded ConflictException when username create loses a uniqueness race", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.user.update.mockRejectedValue(uniqueConstraintError());

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toMatchObject({
        response: {
          code: USERNAME_TAKEN_CODE,
          message: USER_SERVICE_ERRORS.USERNAME_TAKEN("jane.doe"),
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

      await expect(service.getById(userId)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId)),
      );
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

    it("throws UnprocessableEntityException when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.getOnboardedById(userId)).rejects.toThrow(
        new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE),
      );
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getOnboardedById(userId)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId)),
      );
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

    it("throws UnprocessableEntityException when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId)),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rethrows unexpected Prisma errors from user.update", async () => {
      const prismaError = new Error("Unique constraint failed");
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.user.update.mockRejectedValue(prismaError);

      await expect(service.update(userId, updateDto)).rejects.toThrow(prismaError);
    });

    it("throws coded ConflictException when username update loses a uniqueness race", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.user.update.mockRejectedValue(uniqueConstraintError());

      await expect(service.update(userId, { username: "taken.name" })).rejects.toMatchObject({
        response: {
          code: USERNAME_TAKEN_CODE,
          message: USER_SERVICE_ERRORS.USERNAME_TAKEN("taken.name"),
        },
      });
    });
  });

  describe("checkUsernameAvailability", () => {
    it("returns INVALID_FORMAT for too-short usernames", async () => {
      await expect(service.checkUsernameAvailability(userId, "ab")).resolves.toEqual({
        username: "ab",
        available: false,
        reason: "INVALID_FORMAT",
      });
      expect(prisma.userDetails.findFirst).not.toHaveBeenCalled();
    });

    it("returns RESERVED for reserved usernames", async () => {
      await expect(service.checkUsernameAvailability(userId, "Admin")).resolves.toEqual({
        username: "admin",
        available: false,
        reason: "RESERVED",
      });
      expect(prisma.userDetails.findFirst).not.toHaveBeenCalled();
    });

    it("returns TAKEN when another user holds the username", async () => {
      prisma.userDetails.findFirst.mockResolvedValue({ userId: "other-user" } as never);

      await expect(service.checkUsernameAvailability(userId, "Jane.Doe")).resolves.toEqual({
        username: "jane.doe",
        available: false,
        reason: "TAKEN",
      });
      expect(prisma.userDetails.findFirst).toHaveBeenCalledWith({
        where: { username: "jane.doe", NOT: { userId } },
        select: { userId: true },
      });
    });

    it("returns available when the caller already owns the username", async () => {
      prisma.userDetails.findFirst.mockResolvedValue(null);

      await expect(service.checkUsernameAvailability(userId, "jane.doe")).resolves.toEqual({
        username: "jane.doe",
        available: true,
        reason: null,
      });
    });
  });

  describe("completeAccountDeletion", () => {
    const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
    const auth0DeletedAt = new Date("2026-06-10T12:02:00.000Z");

    const freshDeletionUser = (): AccountDeletionUser => ({
      id: userId,
      providerSub,
      deletionStartedAt: null,
      auth0DeletedAt: null,
      deletionPhotoPolicy: null,
    });

    const expectTombstoneThenDelete = (): void => {
      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalledWith({
        where: { providerSubHash },
        create: { providerSubHash, formerUserId: userId },
        // deletedAt is refreshed: a subject that registered again and deleted
        // again must be judged against the later deletion, not the first.
        update: { formerUserId: userId, deletedAt: expect.any(Date) as Date },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
      expect(prisma.deletedProviderSub.upsert.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.delete.mock.invocationCallOrder[0],
      );
    };

    it("runs intent → Auth0 → auth0 cleared → tombstone+delete in order on a fresh account", async () => {
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(freshDeletionUser());

      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: userId },
        data: { deletionStartedAt: expect.any(Date) as Date, deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP },
        select: { deletionStartedAt: true },
      });
      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: userId },
        data: { auth0DeletedAt: expect.any(Date) as Date },
        select: { auth0DeletedAt: true },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expectTombstoneThenDelete();
      expectDeletionSagaOrder(
        prisma.user.update,
        deletionPrep.prepareRelatedData,
        auth0Management.deleteUser,
        prisma.$transaction,
      );
    });

    it("revokes the Apple token before the Auth0 user is deleted, on every pass that still has one", async () => {
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
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
      const auth0ClearedUser: AccountDeletionUser = {
        id: userId,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt,
        deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP,
      };
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(auth0ClearedUser);

      expect(appleRevocation.revokeBeforeAuth0Delete).not.toHaveBeenCalled();
    });

    it("leaves the Auth0 user in place when Apple revocation fails in a retryable way", async () => {
      prisma.user.update.mockResolvedValueOnce({ deletionStartedAt } as never);
      const outage = new Error("Apple unreachable");
      appleRevocation.revokeBeforeAuth0Delete.mockRejectedValue(outage);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toBe(outage);

      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
      // Intent stays stamped so the reconciler retries with the token still in Auth0.
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it("resumes mid-saga: skips re-stamping intent, retries Auth0, then tombstones and deletes", async () => {
      const midSagaUser: AccountDeletionUser = {
        id: userId,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt: null,
        deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP,
      };
      prisma.user.update.mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(midSagaUser);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { auth0DeletedAt: expect.any(Date) as Date },
        select: { auth0DeletedAt: true },
      });
      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(auth0Management.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.update.mock.invocationCallOrder[0],
      );
      expectTombstoneThenDelete();
    });

    it("skips Auth0 and only tombstones+deletes when auth0DeletedAt is already set", async () => {
      const auth0ClearedUser: AccountDeletionUser = {
        id: userId,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt,
        deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP,
      };
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(auth0ClearedUser);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expectTombstoneThenDelete();
    });

    it("upserts an existing tombstone so reconciler retries stay idempotent", async () => {
      const auth0ClearedUser: AccountDeletionUser = {
        id: userId,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt,
        deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP,
      };
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
      });
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(auth0ClearedUser);

      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalledWith({
        where: { providerSubHash },
        create: { providerSubHash, formerUserId: userId },
        // deletedAt is refreshed: a subject that registered again and deleted
        // again must be judged against the later deletion, not the first.
        update: { formerUserId: userId, deletedAt: expect.any(Date) as Date },
      });
    });

    it("leaves the Auth0 identity alone when prep fails, so a retryable error costs no login", async () => {
      const prepError = new Error("prep failed");
      prisma.user.update.mockResolvedValueOnce({ deletionStartedAt } as never);
      deletionPrep.prepareRelatedData.mockRejectedValue(prepError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(prepError);

      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.deletedProviderSub.upsert).not.toHaveBeenCalled();
    });

    it("prepares with the requested policy and records it with the intent", async () => {
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(freshDeletionUser(), AccountDeletionPhotoPolicy.DELETE);

      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: userId },
        data: { deletionStartedAt: expect.any(Date) as Date, deletionPhotoPolicy: AccountDeletionPhotoPolicy.DELETE },
        select: { deletionStartedAt: true },
      });
      expect(deletionPrep.prepareRelatedData).toHaveBeenCalledWith(userId, AccountDeletionPhotoPolicy.DELETE);
    });

    it("resumes with the stored policy, ignoring what the retry asks for", async () => {
      const midSaga: AccountDeletionUser = {
        id: userId,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt,
        deletionPhotoPolicy: AccountDeletionPhotoPolicy.DELETE,
      };
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(midSaga, AccountDeletionPhotoPolicy.KEEP);

      expect(deletionPrep.prepareRelatedData).toHaveBeenCalledWith(userId, AccountDeletionPhotoPolicy.DELETE);
    });

    it("purges the prepared S3 keys, avatar included, only after the row is gone", async () => {
      const s3Keys = ["photos/u/e/a", "photos/u/e/b", "avatars/u/a"];
      deletionPrep.prepareRelatedData.mockResolvedValue({
        summary: {
          eventsDeleted: 1,
          eventsHandedOver: 0,
          photosKept: 0,
          photosDeleted: 2,
          reportsClosed: 0,
          uploadsDiscarded: 0,
          avatarQueued: true,
        },
        s3Keys,
      });
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(freshDeletionUser());

      expect(photoPurge.purgeObjects).toHaveBeenCalledWith(s3Keys, {
        event: "user.account.photos_purged",
        userId,
      });
      expect(prisma.user.delete.mock.invocationCallOrder[0]).toBeLessThan(
        photoPurge.purgeObjects.mock.invocationCallOrder[0],
      );
    });

    it("never stores the raw subject in the tombstone", async () => {
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(freshDeletionUser());

      const [args] = prisma.deletedProviderSub.upsert.mock.calls[0];
      expect(JSON.stringify(args)).not.toContain(providerSub);
    });

    it("does not call Auth0 or delete the user when stamping deletionStartedAt fails", async () => {
      const stampError = new Error("Database unavailable");
      prisma.user.update.mockRejectedValue(stampError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(stampError);

      expect(deletionPrep.prepareRelatedData).not.toHaveBeenCalled();
      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("does not delete the user when Auth0 fails after intent is stamped", async () => {
      const auth0Error = new Error("Auth0 Management API unavailable");
      prisma.user.update.mockResolvedValueOnce({ deletionStartedAt } as never);
      auth0Management.deleteUser.mockRejectedValue(auth0Error);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(auth0Error);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("does not delete the user when stamping auth0DeletedAt fails after Auth0 succeeds", async () => {
      const stampError = new Error("Database write failed");
      prisma.user.update.mockResolvedValueOnce({ deletionStartedAt } as never).mockRejectedValueOnce(stampError);
      auth0Management.deleteUser.mockResolvedValue(undefined);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(stampError);

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("does not delete the user when tombstone upsert fails inside the transaction", async () => {
      const tombstoneError = new Error("Tombstone write failed");
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockRejectedValue(tombstoneError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(tombstoneError);

      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("rethrows when user delete fails after the tombstone is written", async () => {
      const prismaError = new Error("Foreign key constraint violation");
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
      });
      prisma.user.delete.mockRejectedValue(prismaError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(prismaError);

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("remove", () => {
    it("loads the user and forwards the caller's photo policy to completeAccountDeletion", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      const completeSpy = jest.spyOn(service, "completeAccountDeletion").mockResolvedValue(undefined);

      await service.remove(userId, AccountDeletionPhotoPolicy.DELETE);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(completeSpy).toHaveBeenCalledWith(userWithDetails, AccountDeletionPhotoPolicy.DELETE);
      completeSpy.mockRestore();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove(userId, AccountDeletionPhotoPolicy.KEEP)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId)),
      );
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

    it("rejects when the existing user has deletion in progress", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userWithDetails,
        deletionStartedAt: new Date("2026-06-10T12:01:00.000Z"),
      });

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(new UnauthorizedException());
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
      prisma.deletedProviderSub.findUnique.mockResolvedValue({ providerSubHash, formerUserId: userId, deletedAt });
      prisma.user.create.mockResolvedValue(userWithoutDetails);

      const result = await service.resolveByProviderSub(providerSub, deletedAt.getTime() / 1000 + 60);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { providerSub },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(userWithoutDetails);
    });

    it("refuses a tombstoned subject whose token predates the deletion", async () => {
      const deletedAt = new Date("2026-06-10T12:00:00.000Z");
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue({ providerSubHash, formerUserId: userId, deletedAt });

      await expect(service.resolveByProviderSub(providerSub, deletedAt.getTime() / 1000 - 60)).rejects.toThrow(
        new UnauthorizedException(),
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects JIT create when a tombstone exists for the providerSub", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
      });

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(new UnauthorizedException());
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

    it("rejects when a unique race resolves to a mid-deletion user", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        ...userWithDetails,
        deletionStartedAt: new Date("2026-06-10T12:01:00.000Z"),
      });
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(new UnauthorizedException());
    });

    it("rejects when a unique race finds no user but a tombstone now exists", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        providerSubHash,
        formerUserId: userId,
        deletedAt: now,
      });
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(new UnauthorizedException());
    });

    it("rejects when a unique race finds neither user nor tombstone", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(new UnauthorizedException());
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
