import { Injectable, OnModuleInit } from "@nestjs/common";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSource, OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { isPhotoS3Key, PHOTO_S3_KEY_PREFIX } from "./photos.constants";

/**
 * Registers photos/ with the S3 orphan reconciler.
 *
 * A Photo row is inserted before its upload URL is ever minted, so an object
 * can only exist after its row did; when the lookup finds no row, the row was
 * deleted afterwards (photo delete, event or account cascade). That is why
 * this source needs no minimum age of its own.
 */
@Injectable()
export class PhotoOrphanSource implements OrphanSource, OnModuleInit {
  readonly prefix = PHOTO_S3_KEY_PREFIX;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OrphanSourceRegistry,
    private readonly evidenceService: EvidenceService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  isOwnedKey(key: string): boolean {
    return isPhotoS3Key(key);
  }

  // Photo.s3Key is unique, so this is an index probe per key in one round
  // trip. A row in any status, PENDING included, keeps its object, and so
  // does a report whose evidence copy of the object hasn't been made yet.
  async findReferencedKeys(keys: string[]): Promise<string[]> {
    const [rows, evidence] = await Promise.all([
      this.prisma.photo.findMany({ where: { s3Key: { in: keys } }, select: { s3Key: true } }),
      this.evidenceService.findKeysAwaitingQuarantine(keys),
    ]);
    return [...new Set([...rows.map((row) => row.s3Key), ...evidence])];
  }
}
