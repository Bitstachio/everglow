import { randomUUID } from "node:crypto";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Photo, PhotoStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UploadFileDto } from "./dto/create-upload-urls.dto";
import { ListPhotosQueryDto } from "./dto/list-photos-query.dto";
import { PhotoWithUrl } from "./mappers/photo.mapper";
import { PhotoStorageService } from "./photo-storage.service";
import { PHOTO_ACTIONS, PHOTO_SUBJECT } from "./photos.abilities";
import {
  buildPhotoS3Key,
  CONFIRM_PHOTO_STATUSES,
  ConfirmPhotoStatus,
  DEFAULT_PHOTO_PAGE_SIZE,
  DOWNLOAD_URL_TTL_SECONDS,
  PHOTO_SERVICE_ERRORS,
  UPLOAD_URL_TTL_SECONDS,
} from "./photos.constants";

export interface UploadSlot {
  photoId: string;
  uploadUrl: string;
}

export interface ConfirmResult {
  photoId: string;
  status: ConfirmPhotoStatus;
}

export interface PhotoPage {
  items: PhotoWithUrl[];
  nextCursor: string | null;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly s3Service: S3Service,
    private readonly photoStorageService: PhotoStorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** Loads the event with the caller's access rows, or 404s. */
  private async findEventForCaller(eventId: string, callerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { eventAccesses: { where: { userId: callerId } } },
    });
    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));
    return event;
  }

  async createUploadSlots(eventId: string, callerId: string, files: UploadFileDto[]): Promise<UploadSlot[]> {
    const event = await this.findEventForCaller(eventId, callerId);

    // Check if the caller is authorized to upload photos to the event.
    const ability = await this.abilityFactory.createForCaller(callerId);
    // The photo does not exist yet, so authorize against a prospective row.
    const prospectivePhoto = subject(PHOTO_SUBJECT, { eventId, addedById: callerId, event } as unknown as Photo);
    if (!ability.can(PHOTO_ACTIONS.CREATE, prospectivePhoto)) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.CREATE_FORBIDDEN(eventId));
    }

    // Build a PENDING row per file up front: the S3 key embeds the photo id.
    const rows = files.map((file) => {
      const photoId = randomUUID();
      return {
        id: photoId,
        eventId,
        addedById: callerId,
        s3Key: buildPhotoS3Key(callerId, eventId, photoId),
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        status: PhotoStatus.PENDING,
      };
    });
    // Quota check and insert run in one serializable transaction, so concurrent
    // batches for the same uploader cannot both slip under the cap.
    await this.photoStorageService.reserveUploadBytes(callerId, rows);

    // Presign only once the reservation has committed: no transaction is held
    // open across S3 calls, and a rejected batch mints no URLs. The URL binds
    // the declared type and size, so S3 refuses a body that differs from them.
    try {
      return await Promise.all(
        rows.map(async (row) => ({
          photoId: row.id,
          uploadUrl: await this.s3Service.getPresignedUploadUrl({
            key: row.s3Key,
            contentType: row.contentType,
            contentLength: row.sizeBytes,
            expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
          }),
        })),
      );
    } catch (error) {
      // No URL reached the client, so nothing can ever land on these keys.
      // Release the rows now instead of letting them hold quota until the
      // stale-PENDING sweeper gets to them.
      await this.releaseSlots(
        rows.map((row) => row.id),
        { event: "photo.upload_slots.presign_failed", eventId, callerId },
      );
      throw error;
    }
  }

  /**
   * Deletes PENDING rows whose upload can no longer complete, returning their
   * quota. Only PENDING rows are touched, so a concurrent confirm that has
   * just verified one of them keeps its photo. Failure is logged rather than
   * thrown: the sweeper reclaims whatever is left, and the caller's own error
   * (if any) is the one worth surfacing.
   */
  private async releaseSlots(
    photoIds: string[],
    context: { event: string; eventId: string; callerId: string; [key: string]: unknown },
  ): Promise<number> {
    if (photoIds.length === 0) return 0;

    try {
      const { count } = await this.prisma.photo.deleteMany({
        where: { id: { in: photoIds }, status: PhotoStatus.PENDING },
      });
      this.logger.info({ ...context, released: count, audit: true }, "Upload slots released");
      return count;
    } catch (error) {
      this.logger.error(
        { err: error as Error, ...context, photoIds },
        "Failed to release upload slots; the stale-PENDING sweeper will reclaim them",
      );
      return 0;
    }
  }

  async confirmUploads(eventId: string, callerId: string, photoIds: string[]): Promise<ConfirmResult[]> {
    const event = await this.findEventForCaller(eventId, callerId);

    // Confirming is part of the upload flow, so it requires the same permission as minting upload slots.
    const ability = await this.abilityFactory.createForCaller(callerId);
    const prospectivePhoto = subject(PHOTO_SUBJECT, { eventId, addedById: callerId, event } as unknown as Photo);
    if (!ability.can(PHOTO_ACTIONS.CREATE, prospectivePhoto)) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.CONFIRM_FORBIDDEN(eventId));
    }

    const uniqueIds = [...new Set(photoIds)];
    // Only the caller's own slots: a photoId minted for someone else is not
    // theirs to confirm, and since a rejected slot is released below, it must
    // not be theirs to release either.
    const photos = await this.prisma.photo.findMany({
      where: { id: { in: uniqueIds }, eventId, addedById: callerId },
    });
    const photosById = new Map(photos.map((photo) => [photo.id, photo]));

    const verifiedIds: string[] = [];
    const missingIds: string[] = [];
    const mismatched: Photo[] = [];
    const results = await Promise.all(
      uniqueIds.map(async (photoId): Promise<ConfirmResult> => {
        const photo = photosById.get(photoId);
        if (!photo) return { photoId, status: CONFIRM_PHOTO_STATUSES.NOT_FOUND };
        // Idempotent: re-confirming an already verified photo is a no-op.
        if (photo.status === PhotoStatus.READY) return { photoId, status: CONFIRM_PHOTO_STATUSES.READY };

        // Verify the photo exists and matches the metadata.
        const head = await this.s3Service.headObject(photo.s3Key);
        if (!head.exists) {
          missingIds.push(photoId);
          return { photoId, status: CONFIRM_PHOTO_STATUSES.MISSING };
        }
        if (head.contentType !== photo.contentType || head.sizeBytes !== photo.sizeBytes) {
          mismatched.push(photo);
          return { photoId, status: CONFIRM_PHOTO_STATUSES.MISMATCHED };
        }

        verifiedIds.push(photoId);
        return { photoId, status: CONFIRM_PHOTO_STATUSES.READY };
      }),
    );

    if (verifiedIds.length > 0) {
      await this.prisma.photo.updateMany({
        where: { id: { in: verifiedIds } },
        data: { status: PhotoStatus.READY },
      });
      this.logger.info(
        { event: "photo.uploads_confirmed", eventId, callerId, confirmedCount: verifiedIds.length },
        "Photo uploads confirmed",
      );
    }

    await this.releaseRejectedSlots(eventId, callerId, missingIds, mismatched);

    return results;
  }

  /**
   * A MISSING or MISMATCHED verdict is final: the client said the upload was
   * done, and the bytes are absent or not what was declared. Releasing the
   * slot here returns its quota at once instead of after the sweeper's cutoff,
   * and removes a mismatched object rather than leaving it billed under a row
   * that can never become READY. The client mints a fresh slot to retry.
   */
  private async releaseRejectedSlots(
    eventId: string,
    callerId: string,
    missingIds: string[],
    mismatched: Photo[],
  ): Promise<void> {
    if (missingIds.length === 0 && mismatched.length === 0) return;

    // A mismatched object exists in S3: remove it before its row, as a manual
    // delete does, so a failed S3 delete leaves the row for the sweeper to retry.
    const objectDeletes = await Promise.allSettled(mismatched.map((photo) => this.s3Service.deleteObject(photo.s3Key)));
    const releasable = [...missingIds];
    objectDeletes.forEach((outcome, index) => {
      const photo = mismatched[index];
      if (outcome.status === "fulfilled") {
        releasable.push(photo.id);
        return;
      }
      this.logger.warn(
        { event: "photo.upload_rejected.object_retained", photoId: photo.id, eventId, callerId },
        "Mismatched upload could not be deleted from S3; its row stays for the sweeper",
      );
    });

    await this.releaseSlots(releasable, {
      event: "photo.upload_slots.rejected",
      eventId,
      callerId,
      missing: missingIds.length,
      mismatched: mismatched.length,
    });
  }

  async listPhotos(eventId: string, callerId: string, query: ListPhotosQueryDto): Promise<PhotoPage> {
    const event = await this.findEventForCaller(eventId, callerId);

    const ability = await this.abilityFactory.createForCaller(callerId);
    // Listing is reading photos of the event; authorize against a prospective row.
    const prospectivePhoto = subject(PHOTO_SUBJECT, { eventId, event } as unknown as Photo);
    if (!ability.can(PHOTO_ACTIONS.READ, prospectivePhoto)) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.LIST_FORBIDDEN(eventId));
    }

    const limit = query.limit ?? DEFAULT_PHOTO_PAGE_SIZE;
    // Fetch one extra row to know whether a next page exists. The cursor is
    // the last photo id of the previous page; Prisma resolves its sort values
    // for keyset pagination, so results stay stable while new photos arrive.
    const photos = await this.prisma.photo.findMany({
      where: {
        AND: [
          { eventId, status: PhotoStatus.READY },
          accessibleBy(ability, PHOTO_ACTIONS.READ).ofType(PHOTO_SUBJECT) as Prisma.PhotoWhereInput,
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasMore = photos.length > limit;
    const page = hasMore ? photos.slice(0, limit) : photos;

    const items = await Promise.all(
      page.map(async (photo) => ({
        ...photo,
        url: await this.s3Service.getPresignedDownloadUrl({
          key: photo.s3Key,
          expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
        }),
      })),
    );

    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async findOne(photoId: string, callerId: string): Promise<PhotoWithUrl> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } },
    });
    // Unverified photos are invisible, same as in the event photo list.
    if (!photo || photo.status !== PhotoStatus.READY) {
      throw new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId));
    }

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(PHOTO_ACTIONS.READ, subject(PHOTO_SUBJECT, photo))) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.READ_FORBIDDEN(photoId));
    }

    const { event, ...rest } = photo;
    void event;
    const url = await this.s3Service.getPresignedDownloadUrl({
      key: photo.s3Key,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
    return { ...rest, url };
  }

  async deletePhoto(photoId: string, callerId: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } },
    });
    if (!photo) throw new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(PHOTO_ACTIONS.DELETE, subject(PHOTO_SUBJECT, photo))) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.DELETE_FORBIDDEN(photoId));
    }

    // S3 first: if it fails the row survives and the delete can be retried.
    await this.s3Service.deleteObject(photo.s3Key);
    await this.prisma.photo.delete({ where: { id: photoId } });

    this.logger.info(
      { event: "photo.deleted", photoId, eventId: photo.eventId, callerId, audit: true },
      "Photo deleted",
    );
  }
}
