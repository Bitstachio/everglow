import { randomUUID } from "node:crypto";
import { subject } from "@casl/ability";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Photo, PhotoStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { GALLERY_SERVICE_ERRORS } from "src/galleries/galleries.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UploadFileDto } from "./dto/create-upload-urls.dto";
import { PHOTO_ACTIONS, PHOTO_SUBJECT } from "./photos.abilities";
import {
  buildPhotoS3Key,
  CONFIRM_PHOTO_STATUSES,
  ConfirmPhotoStatus,
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
}
