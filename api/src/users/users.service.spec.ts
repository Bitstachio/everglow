import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaClient } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { USER_SERVICE_ERRORS } from "./users.constants";
import { hashProviderSub } from "./deleted-account";
import { UsersService } from "./users.service";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";
import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";

describe("UsersService", () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;

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
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const userWithDetails: UserWithDetails = {
    id: userId,
    providerSub,
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
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
      prisma.deletedAccount.findUnique.mockResolvedValue(null);
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
      prisma.deletedAccount.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(prismaError);

      await expect(service.resolveByProviderSub(providerSub)).rejects.toThrow(prismaError);
    });

    describe("after the account was deleted", () => {
      const deletedAt = new Date("2026-06-10T12:00:00.000Z");
      const deletedAtSeconds = deletedAt.getTime() / 1000;
      const tombstone = { id: "t", providerSubHash: hashProviderSub(providerSub), userId, deletedAt };

      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.deletedAccount.findUnique.mockResolvedValue(tombstone);
      });

      it("does not consult the tombstone while the account exists", async () => {
        prisma.user.findUnique.mockResolvedValue(userWithDetails);

        await service.resolveByProviderSub(providerSub, deletedAtSeconds - 60);

        expect(prisma.deletedAccount.findUnique).not.toHaveBeenCalled();
      });

      it("refuses a token issued before the deletion instead of resurrecting the account", async () => {
        await expect(service.resolveByProviderSub(providerSub, deletedAtSeconds - 60)).rejects.toThrow(
          new UnauthorizedException(USER_SERVICE_ERRORS.ACCOUNT_DELETED),
        );

        expect(prisma.deletedAccount.findUnique).toHaveBeenCalledWith({
          where: { providerSubHash: hashProviderSub(providerSub) },
        });
        expect(prisma.user.create).not.toHaveBeenCalled();
      });

      it("refuses a token that carries no issue time", async () => {
        await expect(service.resolveByProviderSub(providerSub)).rejects.toBeInstanceOf(UnauthorizedException);

        expect(prisma.user.create).not.toHaveBeenCalled();
      });

      it("provisions a fresh account for a token issued after the deletion", async () => {
        prisma.user.create.mockResolvedValue(userWithoutDetails);

        const result = await service.resolveByProviderSub(providerSub, deletedAtSeconds + 60);

        expect(prisma.user.create).toHaveBeenCalledWith({
          data: { providerSub },
          include: userWithDetailsInclude,
        });
        expect(result).toEqual(userWithoutDetails);
      });
    });
  });
});
