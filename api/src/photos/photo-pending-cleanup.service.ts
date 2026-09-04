import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PhotoStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";

export interface PhotoPendingCleanupResult {
  scanned: number;
  deleted: number;
  failed: number;
}

@Injectable()
export class PhotoPendingCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async cleanupStalePendingPhotos(): Promise<PhotoPendingCleanupResult> {
    const maxAgeHours = this.configService.getOrThrow<number>("photos.pendingCleanupMaxAgeHours");
    const batchSize = this.configService.getOrThrow<number>("photos.pendingCleanupBatchSize");
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const stalePhotos = await this.prisma.photo.findMany({
      where: { status: PhotoStatus.PENDING, createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true, s3Key: true, eventId: true },
    });

    let deleted = 0;
    let failed = 0;

    for (const photo of stalePhotos) {
      try {
        await this.s3Service.deleteObject(photo.s3Key);
        await this.prisma.photo.delete({ where: { id: photo.id } });
        deleted += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          { err: error as Error, event: "photo.pending_cleanup.failed", photoId: photo.id, eventId: photo.eventId },
          "Failed to clean up stale pending photo",
        );
      }
    }

    if (stalePhotos.length > 0) {
      this.logger.info(
        {
          event: "photo.pending_cleanup.completed",
          scanned: stalePhotos.length,
          deleted,
          failed,
          maxAgeHours,
          audit: true,
        },
        "Stale pending photo cleanup finished",
      );
    }

    return { scanned: stalePhotos.length, deleted, failed };
  }
}
