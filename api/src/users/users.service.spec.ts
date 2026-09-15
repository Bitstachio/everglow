import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { USER_SERVICE_ERRORS } from "./users.constants";
import { AccountDeletionUser, UsersService } from "./users.service";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";

/** Asserts the four saga steps ran in order: intent → Auth0 → auth0 cleared → Postgres. */
const expectDeletionSagaOrder = (userUpdate: jest.Mock, deleteAuth0: jest.Mock, userDelete: jest.Mock): void => {
  expect(userUpdate.mock.invocationCallOrder[0]).toBeLessThan(deleteAuth0.mock.invocationCallOrder[0]);
  expect(deleteAuth0.mock.invocationCallOrder[0]).toBeLessThan(userUpdate.mock.invocationCallOrder[1]);
  expect(userUpdate.mock.invocationCallOrder[1]).toBeLessThan(userDelete.mock.invocationCallOrder[0]);
};

describe("UsersService", () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;
  let auth0Management: DeepMockProxy<Auth0ManagementService>;

  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const createUserDetailsDto: CreateUserDetailsDto = {
    name: "Jane Doe",
    email: "jane@example.com",
  };

  const userWithoutDetails: UserWithDetails = {
    id: userId,
    providerSub,
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    deletionStartedAt: null,
    auth0DeletedAt: null,
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
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId,
      email: "jane@example.com",
      name: "Jane Doe",
      createdAt: now,
      updatedAt: now,
    },
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    auth0Management = mockDeep<Auth0ManagementService>();

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
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue(userWithDetails);

      const result = await service.createDetails(userId, createUserDetailsDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(prisma.userDetails.count).toHaveBeenCalledWith({
        where: { email: createUserDetailsDto.email, NOT: { userId: undefined } },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          details: {
            create: {
              email: createUserDetailsDto.email,
              name: createUserDetailsDto.name,
            },
          },
        },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(userWithDetails);
    });

    it("throws ConflictException when the user has already completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toThrow(
        new ConflictException(USER_SERVICE_ERRORS.DETAILS_ALREADY_EXIST(userId)),
      );
      expect(prisma.userDetails.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId)),
      );
      expect(prisma.userDetails.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws ConflictException when the email is already taken", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.userDetails.count.mockResolvedValue(1);

      await expect(service.createDetails(userId, createUserDetailsDto)).rejects.toThrow(
        new ConflictException(USER_SERVICE_ERRORS.EMAIL_TAKEN(createUserDetailsDto.email)),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rethrows unexpected Prisma errors from user.update", async () => {
      const prismaError = new Error("Database connection lost");
      prisma.user.findUnique.mockResolvedValue(userWithoutDetails);
      prisma.userDetails.count.mockResolvedValue(0);
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

  describe("update", () => {
    const updateDto: UpdateUserDto = {
      name: "Jane Smith",
      email: "jane.smith@example.com",
    };

    const updatedUser: UserWithDetails = {
      ...userWithDetails,
      details: {
        ...userWithDetails.details!,
        name: updateDto.name!,
        email: updateDto.email!,
      },
    };

    it("updates user details when onboarding is complete and email is unique", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, updateDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(prisma.userDetails.count).toHaveBeenCalledWith({
        where: { email: updateDto.email, NOT: { userId } },
      });
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

    it("updates user details without checking email uniqueness when email is omitted", async () => {
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
      expect(prisma.userDetails.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId)),
      );
      expect(prisma.userDetails.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws ConflictException when the new email is already taken", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.userDetails.count.mockResolvedValue(1);

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        new ConflictException(USER_SERVICE_ERRORS.EMAIL_TAKEN(updateDto.email!)),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rethrows unexpected Prisma errors from user.update", async () => {
      const prismaError = new Error("Unique constraint failed");
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockRejectedValue(prismaError);

      await expect(service.update(userId, updateDto)).rejects.toThrow(prismaError);
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
    });

    it("runs intent → Auth0 → auth0 cleared → Postgres in order on a fresh account", async () => {
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(freshDeletionUser());

      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: userId },
        data: { deletionStartedAt: expect.any(Date) as Date },
        select: { deletionStartedAt: true },
      });
      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: userId },
        data: { auth0DeletedAt: expect.any(Date) as Date },
        select: { auth0DeletedAt: true },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
      expectDeletionSagaOrder(prisma.user.update, auth0Management.deleteUser, prisma.user.delete);
    });

    it("resumes mid-saga: skips re-stamping intent, retries Auth0, then finishes Postgres", async () => {
      const midSagaUser: AccountDeletionUser = {
        id: userId,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt: null,
      };
      prisma.user.update.mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
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
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
    });

    it("skips Auth0 and only deletes Postgres when auth0DeletedAt is already set", async () => {
      const auth0ClearedUser: AccountDeletionUser = {
        id: userId,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt,
      };
      prisma.user.delete.mockResolvedValue(userWithDetails);

      await service.completeAccountDeletion(auth0ClearedUser);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
    });

    it("does not call Auth0 or delete Postgres when stamping deletionStartedAt fails", async () => {
      const stampError = new Error("Database unavailable");
      prisma.user.update.mockRejectedValue(stampError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(stampError);

      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("does not delete Postgres when Auth0 fails after intent is stamped", async () => {
      const auth0Error = new Error("Auth0 Management API unavailable");
      prisma.user.update.mockResolvedValueOnce({ deletionStartedAt } as never);
      auth0Management.deleteUser.mockRejectedValue(auth0Error);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(auth0Error);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("does not delete Postgres when stamping auth0DeletedAt fails after Auth0 succeeds", async () => {
      const stampError = new Error("Database write failed");
      prisma.user.update.mockResolvedValueOnce({ deletionStartedAt } as never).mockRejectedValueOnce(stampError);
      auth0Management.deleteUser.mockResolvedValue(undefined);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(stampError);

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("rethrows when Postgres delete fails after saga markers are set", async () => {
      const prismaError = new Error("Foreign key constraint violation");
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockRejectedValue(prismaError);

      await expect(service.completeAccountDeletion(freshDeletionUser())).rejects.toThrow(prismaError);

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(providerSub);
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("remove", () => {
    it("loads the user and delegates to completeAccountDeletion", async () => {
      prisma.user.findUnique.mockResolvedValue(userWithDetails);
      const completeSpy = jest.spyOn(service, "completeAccountDeletion").mockResolvedValue(undefined);

      await service.remove(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: userWithDetailsInclude,
      });
      expect(completeSpy).toHaveBeenCalledWith(userWithDetails);
      completeSpy.mockRestore();
    });

    it("throws NotFoundException when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove(userId)).rejects.toThrow(
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
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result).toEqual(userWithDetails);
    });

    it("creates a new user when no record exists for the providerSub", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(userWithoutDetails);

      const result = await service.resolveByProviderSub(providerSub);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { providerSub },
        include: userWithDetailsInclude,
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { providerSub },
        include: userWithDetailsInclude,
      });
      expect(result).toEqual(userWithoutDetails);
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
      prisma.user.create.mockRejectedValue(prismaError);

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(prismaError);
    });
  });
});
