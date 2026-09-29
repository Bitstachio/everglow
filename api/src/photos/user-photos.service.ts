import { Injectable } from "@nestjs/common";
import { PhotoStatus, ReportClosedReason } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { KEYSET_ORDER_BY, KeysetPage, keysetAfter, toKeysetPage } from "src/common/pagination/keyset-cursor";
import { CursorPageQueryDto } from "src/common/pagination/cursor-page-query.dto";
import { DEFAULT_PAGE_SIZE } from "src/common/pagination/pagination.constants";
import { ImageUploadService } from "src/images/image-upload.service";
import { hiddenEventCoverIds } from "src/moderation/event-cover-visibility";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { PhotoWithUrl } from "./mappers/photo.mapper";
import { deleteUploadsInTransaction } from "./photo-deletion";
import { PhotoPurgeService } from "./photo-purge.service";
import { DOWNLOAD_URL_TTL_SECONDS, EVENT_MEMBERSHIP, EventMembership } from "./photos.constants";

export interface EventStorageUsage {
  eventId: string;
  title: string;
  coverUrl: string | null;
  membership: EventMembership;
  photoCount: number;
  bytes: bigint;
}

export interface DeletedOwnPhotos {
  photosDeleted: number;
  bytesFreed: bigint;
}

/**
 * The caller's own uploads, grouped by event: what the storage screen shows
 * and lets them delete. Membership does not matter here. Photos kept in an
 * event the caller left or was removed from still count toward their storage
 * (PhotoStorageService.getUsedBytes), so this is where they take them back.
 * Moderation hiding does not apply either: these are the caller's own photos.
 */
@Injectable()
export class UserPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly imageUploads: ImageUploadService,
    private readonly photoPurgeService: PhotoPurgeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * One row per event the caller has uploads in, largest first. Counts the
   * same statuses as the quota, so the rows add up to `usedBytes`.
   */
  async usageByEvent(userId: string): Promise<EventStorageUsage[]> {
    const groups = await this.prisma.photo.groupBy({
      by: ["eventId"],
      where: { addedById: userId, status: { in: [PhotoStatus.PENDING, PhotoStatus.READY] } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });
    if (groups.length === 0) return [];

    const eventIds = groups.map((group) => group.eventId);
    const [events, memberships, bans] = await Promise.all([
      this.prisma.event.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, title: true, coverS3Key: true },
      }),
      this.prisma.eventAccess.findMany({ where: { userId, eventId: { in: eventIds } }, select: { eventId: true } }),
      this.prisma.eventBan.findMany({ where: { userId, eventId: { in: eventIds } }, select: { eventId: true } }),
    ]);
    const memberOf = new Set(memberships.map((access) => access.eventId));
    const hiddenCovers = await hiddenEventCoverIds(this.prisma, userId, eventIds);
    const bannedFrom = new Set(bans.map((ban) => ban.eventId));
    const eventsById = new Map(events.map((event) => [event.id, event]));

    const rows = await Promise.all(
      groups.flatMap((group) => {
        const event = eventsById.get(group.eventId);
        // Deleting an event cascades its photos, so a group always has its event;
        // skip rather than fail if one disappears between the two queries.
        if (!event) return [];
        return [
          (async (): Promise<EventStorageUsage> => ({
            eventId: event.id,
            title: event.title,
            coverUrl: hiddenCovers.has(event.id) ? null : await this.imageUploads.getDownloadUrl(event.coverS3Key),
            membership: memberOf.has(event.id)
              ? EVENT_MEMBERSHIP.MEMBER
              : bannedFrom.has(event.id)
                ? EVENT_MEMBERSHIP.REMOVED
                : EVENT_MEMBERSHIP.LEFT,
            photoCount: group._count._all,
            bytes: BigInt(group._sum.sizeBytes ?? 0),
          }))(),
        ];
      }),
    );

    return rows.sort((a, b) => (a.bytes === b.bytes ? a.title.localeCompare(b.title) : a.bytes > b.bytes ? -1 : 1));
  }

  /** The caller's photos in one event, newest first, with the shared keyset cursor. */
  async listInEvent(userId: string, eventId: string, query: CursorPageQueryDto): Promise<KeysetPage<PhotoWithUrl>> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    // Decode before querying so a malformed cursor is a 400, not an empty page.
    const afterCursor = keysetAfter(query.cursor);
    const photos = await this.prisma.photo.findMany({
      where: { AND: [{ eventId, addedById: userId, status: PhotoStatus.READY }, ...afterCursor] },
      orderBy: KEYSET_ORDER_BY,
      take: limit + 1,
    });

    const page = toKeysetPage(photos, limit);
    const items = await Promise.all(
      page.items.map(async (photo) => ({
        ...photo,
        url: await this.s3Service.getPresignedDownloadUrl({
          key: photo.s3Key,
          expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
        }),
      })),
    );

    return { items, nextCursor: page.nextCursor };
  }

  /**
   * Deletes the caller's photos in one event: the given ones, or all of them.
   * Ids that are not the caller's photos in that event are ignored, so the
   * count says what actually went.
   */
  async deleteInEvent(userId: string, eventId: string, photoIds?: string[]): Promise<DeletedOwnPhotos> {
    const deleted = await this.prisma.$transaction((tx) =>
      deleteUploadsInTransaction(tx, {
        eventId,
        userId,
        closedById: userId,
        closedReason: ReportClosedReason.PHOTO_DELETED_BY_UPLOADER,
        photoIds,
      }),
    );

    this.logger.info(
      {
        event: "user.storage.photos_deleted",
        userId,
        eventId,
        scope: photoIds ? "selected" : "all",
        photosDeleted: deleted.photosDeleted,
        bytesFreed: deleted.bytesFreed.toString(),
        reportsClosed: deleted.reportsClosed,
        audit: true,
      },
      "Own photos deleted from storage",
    );

    await this.photoPurgeService.purgeObjects(deleted.photoKeys, {
      event: ALERT_EVENTS.USER_STORAGE_PHOTOS_PURGED,
      userId,
      eventId,
    });

    return { photosDeleted: deleted.photosDeleted, bytesFreed: deleted.bytesFreed };
  }
}
