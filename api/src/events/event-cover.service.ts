import { Injectable } from "@nestjs/common";
import { ApiException } from "src/common/errors/api.exception";
import { Event } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import {
  ImageFile,
  ImageSlot,
  ImageUpload,
  ImageUploadService,
  ImageUploadTarget,
} from "src/images/image-upload.service";
import { hiddenEventCoverIds } from "src/moderation/event-cover-visibility";
import { PrismaService } from "src/prisma/prisma.service";
import { EVENT_COVER_S3_KEY_PREFIX } from "./events.constants";
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
    const slot = this.slotFor(event, callerId);

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

    const removed = await this.imageUploads.remove(this.slotFor(event, callerId));
    if (removed) {
      this.logger.info({ event: "event.cover.removed", eventId, callerId, audit: true }, "Event cover removed");
    }
  }

  /** The cover as this viewer may see it: null when there is none, or it is hidden from them by a report. */
  async getCoverUrl(event: Event, viewerId: string): Promise<string | null> {
    if (!event.coverS3Key || event.suspendedAt) return null;
    const hidden = await hiddenEventCoverIds(this.prisma, viewerId, [event.id]);
    return hidden.has(event.id) ? null : this.imageUploads.getDownloadUrl(event.coverS3Key);
  }

  /** getCoverUrl for a list of events, checking reports once for all of them. */
  async getCoverUrls(events: Event[], viewerId: string): Promise<Map<string, string | null>> {
    const withCover = events.filter((event) => event.coverS3Key);
    const hidden = await hiddenEventCoverIds(
      this.prisma,
      viewerId,
      withCover.map((event) => event.id),
    );
    const urls = await Promise.all(
      events.map(
        async (event): Promise<[string, string | null]> => [
          event.id,
          hidden.has(event.id) || event.suspendedAt ? null : await this.imageUploads.getDownloadUrl(event.coverS3Key),
        ],
      ),
    );
    return new Map(urls);
  }

  private targetFor(eventId: string): ImageUploadTarget {
    return { prefix: EVENT_COVER_S3_KEY_PREFIX, ownerId: eventId };
  }

  private slotFor(event: Event, callerId: string): ImageSlot {
    const currentKey = event.coverS3Key;

    return {
      currentKey,
      // Conditional on the key that was read: of two organizers confirming at
      // once only one writes, and the loser is told to retry instead of
      // silently leaving the winner's object referenced by nothing.
      save: async (key) => {
        const { count } = await this.prisma.event.updateMany({
          where: { id: event.id, coverS3Key: currentKey },
          // Who set it goes with it, and is cleared with it.
          data: { coverS3Key: key, coverUpdatedById: key ? callerId : null },
        });
        if (count === 0) throw new ApiException("COVER_CHANGED_CONCURRENTLY");
      },
    };
  }
}
