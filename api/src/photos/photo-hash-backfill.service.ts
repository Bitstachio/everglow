import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PhotoStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { IdenticalCopiesService } from "src/moderation/evidence/identical-copies.service";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { hashPhotoOriginals } from "./photo-hashing";

export interface PhotoHashBackfillResult {
  hashed: number;
  /** Photos whose original couldn't be read; they go to the back of the queue. */
  failed: number;
  /** Hashes that turned out to be of a removed intimate or child-safety image; their photos were removed. */
  removedImageMatches: number;
}

/**
 * Hashes READY photos that have no SHA-256 yet: those confirmed before
 * hashes were recorded, and those whose read failed at confirm
 * (docs/moderation.md §7). A batch per run, oldest untouched first. A photo
 * that turns out to be an identical copy of an intimate or child-safety image
 * the platform already removed is removed with it, as it would have been at
 * the time: under its own report, held and paging for child safety.
 */
@Injectable()
export class PhotoHashBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly identicalCopiesService: IdenticalCopiesService,
    private readonly evidenceService: EvidenceService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async runBackfill(now: Date = new Date()): Promise<PhotoHashBackfillResult> {
    const batchSize = this.configService.getOrThrow<number>("photos.hashBackfillBatchSize");
    const result: PhotoHashBackfillResult = { hashed: 0, failed: 0, removedImageMatches: 0 };

    const photos = await this.prisma.photo.findMany({
      where: { status: PhotoStatus.READY, sha256: null },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true, s3Key: true },
    });
    if (photos.length === 0) return result;

    const hashes = await hashPhotoOriginals(this.s3Service, photos);
    for (const photo of photos) {
      const sha256 = hashes.get(photo.id);
      if (sha256) result.hashed += 1;
      else result.failed += 1;
      // A failed read only touches updatedAt, which moves the photo behind
      // the rest of the queue instead of blocking every later run.
      await this.prisma.photo.updateMany({
        where: { id: photo.id, sha256: null },
        data: sha256 ? { sha256 } : { updatedAt: now },
      });
    }

    const hashed = [...hashes.values()].filter((hash): hash is string => Boolean(hash));
    const removed = await this.identicalCopiesService.findRemovedImages(hashed, now);
    result.removedImageMatches = removed.size;
    if (removed.size > 0) {
      const closed = await this.identicalCopiesService.removeCopies([...new Set(removed.values())], now);
      await this.evidenceService.discardImages(closed, now);
    }

    if (result.failed > 0) {
      this.logger.warn(
        { event: "photo.hash_backfill.read_failed", failed: result.failed },
        "Some photos could not be read for hashing; a later run retries them",
      );
    }
    return result;
  }
}
