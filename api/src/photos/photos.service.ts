import { randomUUID } from "node:crypto";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Photo, PhotoStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { GALLERY_ACTIONS, GALLERY_SUBJECT } from "src/galleries/galleries.abilities";
import { GALLERY_SERVICE_ERRORS } from "src/galleries/galleries.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UploadFileDto } from "./dto/create-upload-urls.dto";
import { ListPhotosQueryDto } from "./dto/list-photos-query.dto";
import { PhotoWithUrl } from "./mappers/photo.mapper";
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
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async createUploadSlots(galleryId: string, callerId: string, files: UploadFileDto[]): Promise<UploadSlot[]> {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } },
    });
    if (!gallery) throw new NotFoundException(GALLERY_SERVICE_ERRORS.NOT_FOUND(galleryId));

    // Check if the caller is authorized to upload photos to the gallery.
    const ability = await this.abilityFactory.createForCaller(callerId);
    // The photo does not exist yet, so authorize against a prospective row.
    const prospectivePhoto = subject(PHOTO_SUBJECT, { galleryId, addedById: callerId, gallery } as unknown as Photo);
    if (!ability.can(PHOTO_ACTIONS.CREATE, prospectivePhoto)) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.CREATE_FORBIDDEN(galleryId));
    }

    // Create a new photo row for each file.
    // Each photo has a unique S3 Key and status of PENDING.
    const rows = files.map((file) => {
      const photoId = randomUUID();
      return {
        id: photoId,
        galleryId,
        addedById: callerId,
        s3Key: buildPhotoS3Key(galleryId, photoId),
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        status: PhotoStatus.PENDING,
      };
    });
    await this.prisma.photo.createMany({ data: rows });

    return Promise.all(
      rows.map(async (row) => ({
        photoId: row.id,
        uploadUrl: await this.s3Service.getPresignedUploadUrl({
          key: row.s3Key,
          contentType: row.contentType,
          expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        }),
      })),
    );
  }

  async confirmUploads(galleryId: string, callerId: string, photoIds: string[]): Promise<ConfirmResult[]> {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } },
    });
    if (!gallery) throw new NotFoundException(GALLERY_SERVICE_ERRORS.NOT_FOUND(galleryId));

    // Confirming is part of the upload flow, so it requires the same permission as minting upload slots.
    const ability = await this.abilityFactory.createForCaller(callerId);
    const prospectivePhoto = subject(PHOTO_SUBJECT, { galleryId, addedById: callerId, gallery } as unknown as Photo);
    if (!ability.can(PHOTO_ACTIONS.CREATE, prospectivePhoto)) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.CONFIRM_FORBIDDEN(galleryId));
    }

    const uniqueIds = [...new Set(photoIds)];
    const photos = await this.prisma.photo.findMany({ where: { id: { in: uniqueIds }, galleryId } });
    const photosById = new Map(photos.map((photo) => [photo.id, photo]));

    const verifiedIds: string[] = [];
    const results = await Promise.all(
      uniqueIds.map(async (photoId): Promise<ConfirmResult> => {
        const photo = photosById.get(photoId);
        if (!photo) return { photoId, status: CONFIRM_PHOTO_STATUSES.NOT_FOUND };
        // Idempotent: re-confirming an already verified photo is a no-op.
        if (photo.status === PhotoStatus.READY) return { photoId, status: CONFIRM_PHOTO_STATUSES.READY };

        // Verify the photo exists and matches the metadata.
        const head = await this.s3Service.headObject(photo.s3Key);
        if (!head.exists) return { photoId, status: CONFIRM_PHOTO_STATUSES.MISSING };
        if (head.contentType !== photo.contentType || head.sizeBytes !== photo.sizeBytes) {
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
        { event: "photo.uploads_confirmed", galleryId, callerId, confirmedCount: verifiedIds.length },
        "Photo uploads confirmed",
      );
    }

    return results;
  }

  async listPhotos(galleryId: string, callerId: string, query: ListPhotosQueryDto): Promise<PhotoPage> {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } },
    });
    if (!gallery) throw new NotFoundException(GALLERY_SERVICE_ERRORS.NOT_FOUND(galleryId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(GALLERY_ACTIONS.READ, subject(GALLERY_SUBJECT, gallery))) {
      throw new ForbiddenException(GALLERY_SERVICE_ERRORS.READ_FORBIDDEN(galleryId));
    }

    const limit = query.limit ?? DEFAULT_PHOTO_PAGE_SIZE;
    // Fetch one extra row to know whether a next page exists. The cursor is
    // the last photo id of the previous page; Prisma resolves its sort values
    // for keyset pagination, so results stay stable while new photos arrive.
    const photos = await this.prisma.photo.findMany({
      where: {
        AND: [
          { galleryId, status: PhotoStatus.READY },
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
      include: { gallery: { include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } } } },
    });
    // Unverified photos are invisible, same as in the gallery list.
    if (!photo || photo.status !== PhotoStatus.READY) {
      throw new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId));
    }

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(PHOTO_ACTIONS.READ, subject(PHOTO_SUBJECT, photo))) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.READ_FORBIDDEN(photoId));
    }

    const { gallery, ...rest } = photo;
    void gallery;
    const url = await this.s3Service.getPresignedDownloadUrl({
      key: photo.s3Key,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
    return { ...rest, url };
  }

  async deletePhoto(photoId: string, callerId: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { gallery: { include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } } } },
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
      { event: "photo.deleted", photoId, galleryId: photo.galleryId, callerId, audit: true },
      "Photo deleted",
    );
  }
}
