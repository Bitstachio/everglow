import { Injectable } from "@nestjs/common";
import { ImageOrphanSource } from "src/images/image-orphan-source";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { EVENT_COVER_S3_KEY_PREFIX } from "./events.constants";

/** Registers event-covers/ with the S3 orphan reconciler: a cover object is kept while an event references it. */
@Injectable()
export class EventCoverOrphanSource extends ImageOrphanSource {
  constructor(
    registry: OrphanSourceRegistry,
    private readonly prisma: PrismaService,
  ) {
    super(EVENT_COVER_S3_KEY_PREFIX, registry);
  }

  // Event.coverS3Key is unique, so this is an index probe per key in one round trip.
  async findReferencedKeys(keys: string[]): Promise<string[]> {
    const rows = await this.prisma.event.findMany({
      where: { coverS3Key: { in: keys } },
      select: { coverS3Key: true },
    });
    return rows.flatMap((row) => (row.coverS3Key ? [row.coverS3Key] : []));
  }
}
