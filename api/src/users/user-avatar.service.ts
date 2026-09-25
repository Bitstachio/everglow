import { ConflictException, Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import {
  ImageFile,
  ImageSlot,
  ImageUpload,
  ImageUploadService,
  ImageUploadTarget,
} from "src/images/image-upload.service";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_AVATAR_S3_KEY_PREFIX, USER_SERVICE_ERRORS } from "./users.constants";
import { UsersService } from "./users.service";
import { OnboardedUser, UserWithDetails } from "./users.types";

/**
 * The profile avatar: `UserDetails.avatarS3Key` plus the rules that are about
 * users. Everything about uploading, verifying, replacing, and removing an
 * image is `ImageUploadService` (docs/image-uploads.md).
 *
 * Every method acts on the caller's own id, which the controller takes from
 * the access token; there is no route that names another user's avatar.
 */
@Injectable()
export class UserAvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly imageUploads: ImageUploadService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UserAvatarService.name);
  }

  async createUpload(userId: string, file: ImageFile): Promise<ImageUpload> {
    // The avatar lives on the details row, so there is nothing to set it on
    // before onboarding; refusing here saves the client a wasted upload.
    await this.usersService.getOnboardedById(userId);

    return this.imageUploads.createUpload(this.targetFor(userId), file);
  }

  async confirmUpload(userId: string, uploadId: string): Promise<UserWithDetails> {
    const user = await this.usersService.getOnboardedById(userId);
    const slot = this.slotFor(user);

    const key = await this.imageUploads.confirmUpload(this.targetFor(userId), uploadId, slot);
    // An idempotent re-confirm changed nothing and is not worth a record.
    if (key === slot.currentKey) return user;

    this.logger.info(
      { event: "user.avatar.set", userId, uploadId, replaced: slot.currentKey !== null, audit: true },
      "User avatar set",
    );

    return this.usersService.getById(userId);
  }

  async remove(userId: string): Promise<void> {
    const user = await this.usersService.getOnboardedById(userId);

    const removed = await this.imageUploads.remove(this.slotFor(user));
    if (removed) this.logger.info({ event: "user.avatar.removed", userId, audit: true }, "User avatar removed");
  }

  async getAvatarUrl(user: UserWithDetails): Promise<string | null> {
    return this.imageUploads.getDownloadUrl(user.details?.avatarS3Key);
  }

  private targetFor(userId: string): ImageUploadTarget {
    return { prefix: USER_AVATAR_S3_KEY_PREFIX, ownerId: userId };
  }

  private slotFor(user: OnboardedUser): ImageSlot {
    const currentKey = user.details.avatarS3Key;

    return {
      currentKey,
      // Conditional on the key that was read: of two confirms racing each
      // other only one writes, and the loser is told to retry instead of
      // silently leaving the winner's object referenced by nothing.
      save: async (key) => {
        const { count } = await this.prisma.userDetails.updateMany({
          where: { userId: user.id, avatarS3Key: currentKey },
          data: { avatarS3Key: key },
        });
        if (count === 0) throw new ConflictException(USER_SERVICE_ERRORS.AVATAR_CHANGED_CONCURRENTLY);
      },
    };
  }
}
