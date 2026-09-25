import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { BlocksService } from "./blocks.service";
import { BLOCK_SERVICE_ERRORS } from "./moderation.constants";
import { BlockWithBlockedUser, blockWithBlockedUserInclude } from "./moderation.types";

describe("BlocksService", () => {
  let service: BlocksService;
  let prisma: DeepMockProxy<PrismaClient>;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const callerId = "11111111-1111-1111-1111-111111111111";
  const targetUserId = "22222222-2222-2222-2222-222222222222";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const block = {
    id: "b10cb10c-b10c-4b10-8b10-b10cb10cb10c",
    blockerId: callerId,
    blockedId: targetUserId,
  } as Partial<BlockWithBlockedUser> as BlockWithBlockedUser;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlocksService,
        { provide: PrismaService, useValue: prisma },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(BlocksService);

    prisma.eventAccess.findFirst.mockResolvedValue({ id: "44444444-4444-4444-4444-444444444444" } as never);
    prisma.userBlock.createMany.mockResolvedValue({ count: 1 });
    prisma.userBlock.findUniqueOrThrow.mockResolvedValue({ ...block, createdAt: now });
  });

  describe("blockUser", () => {
    it("blocks a user the caller shares an event with", async () => {
      const result = await service.blockUser(callerId, targetUserId);

      expect(prisma.eventAccess.findFirst).toHaveBeenCalledWith({
        where: { userId: targetUserId, event: { eventAccesses: { some: { userId: callerId } } } },
        select: { id: true },
      });
      expect(prisma.userBlock.createMany).toHaveBeenCalledWith({
        data: [{ blockerId: callerId, blockedId: targetUserId }],
        skipDuplicates: true,
      });
      expect(prisma.userBlock.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: callerId, blockedId: targetUserId } },
        include: blockWithBlockedUserInclude,
      });
      expect(result.blockedId).toBe(targetUserId);
      expect(logger.info).toHaveBeenCalledWith(
        { event: "user.block.created", callerId, blockedUserId: targetUserId, audit: true },
        "User blocked",
      );
    });

    it("refuses a self-block without touching the database", async () => {
      await expect(service.blockUser(callerId, callerId)).rejects.toThrow(
        new ForbiddenException(BLOCK_SERVICE_ERRORS.CANNOT_BLOCK_SELF),
      );
      expect(prisma.eventAccess.findFirst).not.toHaveBeenCalled();
      expect(prisma.userBlock.createMany).not.toHaveBeenCalled();
    });

    it("answers a stranger exactly like a user id that does not exist, so ids cannot be probed", async () => {
      prisma.eventAccess.findFirst.mockResolvedValue(null);

      await expect(service.blockUser(callerId, targetUserId)).rejects.toThrow(
        new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(targetUserId)),
      );
      // No lookup of the user row at all: there is nothing to tell the two cases apart by.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.userBlock.createMany).not.toHaveBeenCalled();
    });

    it("is idempotent: a repeat, or the loser of a race, returns the existing block and logs nothing", async () => {
      prisma.userBlock.createMany.mockResolvedValue({ count: 0 });

      await expect(service.blockUser(callerId, targetUserId)).resolves.toEqual({ ...block, createdAt: now });
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("unblockUser", () => {
    it("removes the caller's block on the user", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 1 });

      await service.unblockUser(callerId, targetUserId);

      expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
        where: { blockerId: callerId, blockedId: targetUserId },
      });
      expect(logger.info).toHaveBeenCalledWith(
        { event: "user.block.removed", callerId, blockedUserId: targetUserId, audit: true },
        "User unblocked",
      );
    });

    it("is a silent no-op when the user was not blocked", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unblockUser(callerId, targetUserId)).resolves.toBeUndefined();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("listBlockedUsers", () => {
    it("lists only blocks the caller made, most recent first", async () => {
      prisma.userBlock.findMany.mockResolvedValue([]);

      await service.listBlockedUsers(callerId);

      expect(prisma.userBlock.findMany).toHaveBeenCalledWith({
        where: { blockerId: callerId },
        include: blockWithBlockedUserInclude,
        orderBy: { createdAt: "desc" },
      });
    });
  });
});
