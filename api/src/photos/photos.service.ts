import { randomUUID } from "node:crypto";
import { subject } from "@casl/ability";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Photo, PhotoStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { AppAbility } from "src/casl/ability.types";
import { GALLERY_SERVICE_ERRORS } from "src/galleries/galleries.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { userWithDetailsInclude } from "src/users/users.types";
import { UploadFileDto } from "./dto/create-upload-urls.dto";
import { PHOTO_ACTIONS, PHOTO_SUBJECT } from "./photos.abilities";
import { buildPhotoS3Key, PHOTO_SERVICE_ERRORS, UPLOAD_URL_TTL_SECONDS } from "./photos.constants";

export interface UploadSlot {
  photoId: string;
  uploadUrl: string;
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
    const ability = await this.createAbilityForCaller(callerId);
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

  private async createAbilityForCaller(callerId: string): Promise<AppAbility> {
    const isOnboarded = await this.isUserOnboarded(callerId);
    return this.abilityFactory.createForUser({ id: callerId, isOnboarded });
  }

  private async isUserOnboarded(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userWithDetailsInclude,
    });
    return !!user?.details;
  }
}
