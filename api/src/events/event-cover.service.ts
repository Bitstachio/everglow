import { ConflictException, Injectable } from "@nestjs/common";
import { Event } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import {
  ImageFile,
  ImageSlot,
  ImageUpload,
  ImageUploadService,
  ImageUploadTarget,
} from "src/images/image-upload.service";
import { PrismaService } from "src/prisma/prisma.service";
import { EVENT_COVER_S3_KEY_PREFIX, EVENT_SERVICE_ERRORS } from "./events.constants";
import { EventsService } from "./events.service";

/**
 * The event cover: `Event.coverS3Key` plus the rules that are about events.
 * Everything about uploading, verifying, replacing, and removing an image is
 * `ImageUploadService` (docs/image-uploads.md).
 *
 * Whoever may update the event may manage its cover. Every method authorizes
 * through `EventsService.getUpdatable` first, and the S3 key is derived from
 * the id of the event that check was made against.
 */
@Injectable()
export class EventCoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly imageUploads: ImageUploadService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventCoverService.name);
  }

  async createUpload(eventId: string, callerId: string, file: ImageFile): Promise<ImageUpload> {
    await this.eventsService.getUpdatable(eventId, callerId);

    return this.imageUploads.createUpload(this.targetFor(eventId), file);
  }

  async confirmUpload(eventId: string, callerId: string, uploadId: string): Promise<Event> {
    const event = await this.eventsService.getUpdatable(eventId, callerId);
    const slot = this.slotFor(event);

    const key = await this.imageUploads.confirmUpload(this.targetFor(eventId), uploadId, slot);
    // An idempotent re-confirm changed nothing and is not worth a record.
    if (key === slot.currentKey) return event;

    this.logger.info(
      { event: "event.cover.set", eventId, callerId, uploadId, replaced: slot.currentKey !== null, audit: true },
      "Event cover set",
    );

    return this.eventsService.findOne(eventId, callerId);
  }

  async remove(eventId: string, callerId: string): Promise<void> {
    const event = await this.eventsService.getUpdatable(eventId, callerId);

    const removed = await this.imageUploads.remove(this.slotFor(event));
    if (removed) {
      this.logger.info({ event: "event.cover.removed", eventId, callerId, audit: true }, "Event cover removed");
    }
  }

  async getCoverUrl(event: Event): Promise<string | null> {
    return this.imageUploads.getDownloadUrl(event.coverS3Key);
  }

  private targetFor(eventId: string): ImageUploadTarget {
    return { prefix: EVENT_COVER_S3_KEY_PREFIX, ownerId: eventId };
  }

  private slotFor(event: Event): ImageSlot {
    const currentKey = event.coverS3Key;

    return {
      currentKey,
      // Conditional on the key that was read: of two organizers confirming at
      // once only one writes, and the loser is told to retry instead of
      // silently leaving the winner's object referenced by nothing.
      save: async (key) => {
        const { count } = await this.prisma.event.updateMany({
          where: { id: event.id, coverS3Key: currentKey },
          data: { coverS3Key: key },
        });
        if (count === 0) throw new ConflictException(EVENT_SERVICE_ERRORS.COVER_CHANGED_CONCURRENTLY);
      },
    };
  }
}
