import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { BLOCK_SERVICE_ERRORS } from "./moderation.constants";
import { BlockWithBlockedUser, blockWithBlockedUserInclude } from "./moderation.types";

/**
 * The caller's own block list. Nothing here is ever visible to the blocked
 * user: no notification, no error they could tell apart, no field on any
 * response. What a block does to photo reads lives in `PhotoVisibilityService`.
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async blockUser(callerId: string, targetUserId: string): Promise<BlockWithBlockedUser> {
    if (targetUserId === callerId) throw new ForbiddenException(BLOCK_SERVICE_ERRORS.CANNOT_BLOCK_SELF);

    // Only someone the caller shares an event with can be blocked. A stranger
    // and an id that does not exist get the same 404, so the endpoint cannot
    // be used to find out which user ids are real.
    const sharedMembership = await this.prisma.eventAccess.findFirst({
      where: { userId: targetUserId, event: { eventAccesses: { some: { userId: callerId } } } },
      select: { id: true },
    });
    // Opaque 404: same status whether the id is missing or not a shared member.
    if (!sharedMembership) {
      throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("User", "ID", targetUserId));
    }

    // ON CONFLICT DO NOTHING on the (blocker, blocked) unique index: blocking
    // twice, or twice at once, leaves one row and is not an error.
    const { count } = await this.prisma.userBlock.createMany({
      data: [{ blockerId: callerId, blockedId: targetUserId }],
      skipDuplicates: true,
    });
    if (count > 0) {
      this.logger.info(
        { event: "user.block.created", callerId, blockedUserId: targetUserId, audit: true },
        "User blocked",
      );
    }

    return this.prisma.userBlock.findUniqueOrThrow({
      where: { blockerId_blockedId: { blockerId: callerId, blockedId: targetUserId } },
      include: blockWithBlockedUserInclude,
    });
  }

  /** Idempotent: unblocking someone who is not blocked is a no-op, not a 404. */
  async unblockUser(callerId: string, targetUserId: string): Promise<void> {
    const { count } = await this.prisma.userBlock.deleteMany({
      where: { blockerId: callerId, blockedId: targetUserId },
    });
    if (count > 0) {
      this.logger.info(
        { event: "user.block.removed", callerId, blockedUserId: targetUserId, audit: true },
        "User unblocked",
      );
    }
  }

  async listBlockedUsers(callerId: string): Promise<BlockWithBlockedUser[]> {
    return this.prisma.userBlock.findMany({
      where: { blockerId: callerId },
      include: blockWithBlockedUserInclude,
      orderBy: { createdAt: "desc" },
    });
  }
}
