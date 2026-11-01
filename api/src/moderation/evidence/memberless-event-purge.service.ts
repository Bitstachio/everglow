import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { lockPendingModeration } from "../pending-moderation";

export interface MemberlessEventPurgeResult {
  /** Events with no members left and nothing pending, deleted this run. */
  memberlessEventsDeleted: number;
  /** Events with no members that moderation still needs; they stay until it is done. */
  memberlessEventsKept: number;
}

/**
 * The exit for events account deletion kept for moderation (docs/moderation.md
 * §7): a sole organizer's event with OPEN reports or under review outlives the
 * account with no members. Once nothing is pending any more, this deletes it
 * the way any event delete does: the rows in one transaction, then its photos
 * and cover through the normal purge, which copies every reported object to
 * evidence first. Its reports stay, as every report outlives its event.
 *
 * Part of the daily evidence job (EvidenceScheduler). It is a separate
 * provider because PhotoPurgeService depends on EvidenceService.
 */
@Injectable()
export class MemberlessEventPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoPurgeService: PhotoPurgeService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async run(): Promise<MemberlessEventPurgeResult> {
    const batchSize = this.configService.getOrThrow<number>("moderation.evidenceJobBatchSize");
    const result: MemberlessEventPurgeResult = { memberlessEventsDeleted: 0, memberlessEventsKept: 0 };

    const memberless = await this.prisma.event.findMany({
      where: { eventAccesses: { none: {} } },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true },
    });

    for (const { id: eventId } of memberless) {
      const keys = await this.prisma.$transaction(async (tx) => {
        // Locks the event row, so a report filed meanwhile is either counted
        // here or waits until the delete has decided.
        if (await lockPendingModeration(tx, eventId)) return null;
        // Nobody may have come back in between: only an event nobody uses goes.
        if ((await tx.eventAccess.count({ where: { eventId } })) > 0) return null;

        const photos = await tx.photo.findMany({ where: { eventId }, select: { s3Key: true } });
        const event = await tx.event.findUnique({ where: { id: eventId }, select: { coverS3Key: true } });
        const { count } = await tx.event.deleteMany({ where: { id: eventId } });
        if (count === 0) return null;
        const photoKeys = photos.map((photo) => photo.s3Key);
        return event?.coverS3Key ? [...photoKeys, event.coverS3Key] : photoKeys;
      });

      if (!keys) {
        result.memberlessEventsKept += 1;
        continue;
      }
      result.memberlessEventsDeleted += 1;
      this.logger.info(
        { event: "event.memberless.deleted", eventId, objectCount: keys.length, audit: true },
        "Event with no members deleted once moderation was done with it",
      );
      await this.photoPurgeService.purgeObjects(keys, { event: ALERT_EVENTS.EVENT_PHOTOS_PURGED, eventId });
    }

    return result;
  }
}
