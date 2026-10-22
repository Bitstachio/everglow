import { Injectable } from "@nestjs/common";
import { ImageOrphanSource } from "src/images/image-orphan-source";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { USER_AVATAR_S3_KEY_PREFIX } from "./users.constants";

/** Registers avatars/ with the S3 orphan reconciler: an avatar object is kept while a profile references it. */
@Injectable()
export class UserAvatarOrphanSource extends ImageOrphanSource {
  constructor(
    registry: OrphanSourceRegistry,
    private readonly prisma: PrismaService,
    private readonly evidenceService: EvidenceService,
  ) {
    super(USER_AVATAR_S3_KEY_PREFIX, registry);
  }

  // UserDetails.avatarS3Key is unique, so this is an index probe per key in one
  // round trip. A reported avatar whose evidence copy hasn't been made yet is kept too.
  async findReferencedKeys(keys: string[]): Promise<string[]> {
    const [rows, evidence] = await Promise.all([
      this.prisma.userDetails.findMany({ where: { avatarS3Key: { in: keys } }, select: { avatarS3Key: true } }),
      this.evidenceService.findKeysAwaitingQuarantine(keys),
    ]);
    return [...new Set([...rows.flatMap((row) => (row.avatarS3Key ? [row.avatarS3Key] : [])), ...evidence])];
  }
}
