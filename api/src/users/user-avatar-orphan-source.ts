import { Injectable } from "@nestjs/common";
import { ImageOrphanSource } from "src/images/image-orphan-source";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { USER_AVATAR_S3_KEY_PREFIX } from "./users.constants";

/** Registers avatars/ with the S3 orphan reconciler: an avatar object is kept while a profile references it. */
@Injectable()
export class UserAvatarOrphanSource extends ImageOrphanSource {
  constructor(
    registry: OrphanSourceRegistry,
    private readonly prisma: PrismaService,
  ) {
    super(USER_AVATAR_S3_KEY_PREFIX, registry);
  }

  // UserDetails.avatarS3Key is unique, so this is an index probe per key in one round trip.
  async findReferencedKeys(keys: string[]): Promise<string[]> {
    const rows = await this.prisma.userDetails.findMany({
      where: { avatarS3Key: { in: keys } },
      select: { avatarS3Key: true },
    });
    return rows.flatMap((row) => (row.avatarS3Key ? [row.avatarS3Key] : []));
  }
}
