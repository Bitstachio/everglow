import { Injectable, OnModuleInit } from "@nestjs/common";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSource, OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { buildPhotoDerivativeS3Keys, isPhotoS3Key, PHOTO_DERIVED_S3_KEY_PREFIX } from "./photos.constants";

/** The original a derived key was rendered from, when the key is exactly one buildPhotoDerivativeS3Keys makes. */
const originalKeyOf = (key: string): string | null => {
  const match = /^derived\/(photos\/.+)\/[^/]+$/.exec(key);
  if (!match || !isPhotoS3Key(match[1])) return null;
  const { thumb, large } = buildPhotoDerivativeS3Keys(match[1]);
  return key === thumb || key === large ? match[1] : null;
};

/**
 * Backstop for the derived/ tree: every API delete path removes an original's
 * renditions in its own DeleteObjects batch (deleteObjectsWithDerivatives).
 * This recovers renditions from before that, from a batch whose derived keys
 * failed, and from Lambda invocations that wrote after the original was gone.
 *
 * Renditions follow their original: they stay while a photo row points at it,
 * and while a report still needs it as evidence (findKeysAwaitingQuarantine),
 * because the delete paths keep a retained original's copies too.
 */
@Injectable()
export class PhotoDerivativeOrphanSource implements OrphanSource, OnModuleInit {
  readonly prefix = `${PHOTO_DERIVED_S3_KEY_PREFIX}photos/`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OrphanSourceRegistry,
    private readonly evidenceService: EvidenceService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  isOwnedKey(key: string): boolean {
    return originalKeyOf(key) !== null;
  }

  async findReferencedKeys(keys: string[]): Promise<string[]> {
    const originals = [...new Set(keys.flatMap((key) => originalKeyOf(key) ?? []))];
    if (originals.length === 0) return [];
    const [photos, evidence] = await Promise.all([
      this.prisma.photo.findMany({ where: { s3Key: { in: originals } }, select: { s3Key: true } }),
      this.evidenceService.findKeysAwaitingQuarantine(originals),
    ]);
    const referenced = new Set([...photos.map((photo) => photo.s3Key), ...evidence]);
    return keys.filter((key) => referenced.has(originalKeyOf(key) ?? ""));
  }
}
