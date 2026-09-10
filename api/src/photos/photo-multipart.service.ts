import { randomUUID } from "node:crypto";
import { subject } from "@casl/ability";
import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { Photo, PhotoStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { CompleteMultipartPart, MultipartPartSummary, S3Service } from "src/sdk/aws/s3/s3.service";
import { InitiateMultipartUploadDto } from "./dto/initiate-multipart-upload.dto";
import { PhotoStorageService } from "./photo-storage.service";
import { PHOTO_ACTIONS, PHOTO_SUBJECT } from "./photos.abilities";
import {
  buildPhotoS3Key,
  CONFIRM_PHOTO_STATUSES,
  MULTIPART_PART_SIZE_BYTES,
  PHOTO_SERVICE_ERRORS,
  UPLOAD_URL_TTL_SECONDS,
} from "./photos.constants";
import { planMultipartParts } from "./photos.multipart";
import { ConfirmResult, PhotosService } from "./photos.service";

export interface MultipartPartState {
  partNumber: number;
  sizeBytes: number;
  uploadUrl: string;
  uploaded: boolean;
}

export interface MultipartUploadState {
  photoId: string;
  sizeBytes: number;
  partSizeBytes: number;
  expiresAt: Date;
  parts: MultipartPartState[];
}

/** A PENDING row whose multipart upload is open: the two nullable columns are known to be set. */
type OpenMultipartUpload = Photo & { multipartUploadId: string; multipartPartSizeBytes: number };

/** The columns the upload state is built from. */
type UploadLayout = Pick<
  OpenMultipartUpload,
  "id" | "sizeBytes" | "s3Key" | "multipartUploadId" | "multipartPartSizeBytes"
>;

/**
 * S3 multipart upload for one photo: the client PUTs fixed-size parts to
 * presigned URLs and the API assembles them. A dropped connection costs one
 * part instead of the whole file, and an upload survives an app restart
 * because the API, not the client, remembers what S3 already holds.
 */
@Injectable()
export class PhotoMultipartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly s3Service: S3Service,
    private readonly photoStorageService: PhotoStorageService,
    private readonly photosService: PhotosService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async initiate(eventId: string, callerId: string, file: InitiateMultipartUploadDto): Promise<MultipartUploadState> {
    await this.photosService.assertCanUploadToEvent(eventId, callerId, PHOTO_SERVICE_ERRORS.CREATE_FORBIDDEN);

    const photoId = randomUUID();
    const row = {
      id: photoId,
      eventId,
      addedById: callerId,
      s3Key: buildPhotoS3Key(callerId, eventId, photoId),
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      status: PhotoStatus.PENDING,
      multipartPartSizeBytes: MULTIPART_PART_SIZE_BYTES,
    };
    // Same reservation as a single-PUT slot: the whole declared size is charged up front.
    await this.photoStorageService.reserveUploadBytes(callerId, [row]);

    // The upload is opened only once the reservation has committed, and the
    // row learns the upload id straight away: the row is the only record of
    // it, so an id that never reaches the row can only be aborted here.
    let uploadId: string;
    try {
      uploadId = await this.s3Service.createMultipartUpload({ key: row.s3Key, contentType: row.contentType });
    } catch (error) {
      await this.photosService.releaseUploadSlots([{ id: photoId, s3Key: row.s3Key, multipartUploadId: null }], {
        event: "photo.multipart.create_failed",
        eventId,
        callerId,
      });
      throw error;
    }

    const upload: UploadLayout = { ...row, multipartUploadId: uploadId };
    try {
      await this.prisma.photo.update({ where: { id: photoId }, data: { multipartUploadId: uploadId } });
      const state = await this.buildState(upload, new Map());
      this.logger.info(
        {
          event: "photo.multipart.initiated",
          photoId,
          eventId,
          callerId,
          sizeBytes: row.sizeBytes,
          partCount: state.parts.length,
        },
        "Multipart photo upload started",
      );
      return state;
    } catch (error) {
      await this.photosService.releaseUploadSlots([upload], {
        event: "photo.multipart.initiate_failed",
        eventId,
        callerId,
      });
      throw error;
    }
  }

  /** Fresh part URLs plus which parts S3 already holds, for a client resuming after a drop, a restart, or expired URLs. */
  async getState(photoId: string, callerId: string): Promise<MultipartUploadState> {
    const upload = this.requireOpenUpload(await this.loadOwnPhoto(photoId, callerId));
    const uploaded = await this.listUploadedParts(upload, callerId);
    return this.buildState(upload, uploaded);
  }

  async complete(photoId: string, callerId: string): Promise<ConfirmResult> {
    const photo = await this.loadOwnPhoto(photoId, callerId);
    // Completing twice is harmless: the first call already settled the row.
    if (photo.status === PhotoStatus.READY) return { photoId, status: CONFIRM_PHOTO_STATUSES.READY };
    const upload = this.requireOpenUpload(photo);

    // What S3 holds is checked against the planned layout, not against
    // anything the client sends: a part is done only if it is there at its
    // planned size with an ETag to assemble it by.
    const uploaded = await this.listUploadedParts(upload, callerId);
    const incomplete: number[] = [];
    const parts: CompleteMultipartPart[] = [];
    for (const part of planMultipartParts(upload.sizeBytes, upload.multipartPartSizeBytes)) {
      const received = uploaded.get(part.partNumber);
      if (received?.etag && received.sizeBytes === part.sizeBytes) {
        parts.push({ partNumber: part.partNumber, etag: received.etag });
      } else {
        incomplete.push(part.partNumber);
      }
    }
    if (incomplete.length > 0) throw new BadRequestException(PHOTO_SERVICE_ERRORS.MULTIPART_INCOMPLETE(incomplete));

    const outcome = await this.s3Service.completeMultipartUpload({
      key: upload.s3Key,
      uploadId: upload.multipartUploadId,
      parts,
    });
    if (!outcome.completed) {
      if (outcome.code === "NoSuchUpload") return this.expire(upload, callerId);
      // The upload is still open: the client can re-send the parts S3 objected to and try again.
      throw new BadRequestException(PHOTO_SERVICE_ERRORS.MULTIPART_COMPLETE_REJECTED(outcome.code));
    }

    // The assembled object is verified like any other upload. Its content
    // type was fixed when the upload was opened and its size is the sum of
    // the parts, so a mismatch here means the layout was not honoured.
    const [verdict] = await this.photosService.verifyUploads([upload], { eventId: upload.eventId, callerId });
    this.logger.info(
      { event: "photo.multipart.completed", photoId, eventId: upload.eventId, callerId, status: verdict.status },
      "Multipart photo upload completed",
    );
    return verdict;
  }

  /**
   * The caller's own row, in whatever state. Another uploader's slot is
   * reported as not found, as confirm does; continuing an upload needs the
   * same event permission as starting one.
   */
  private async loadOwnPhoto(photoId: string, callerId: string): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } },
    });
    if (!photo || photo.addedById !== callerId) throw new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(PHOTO_ACTIONS.CREATE, subject(PHOTO_SUBJECT, photo))) {
      throw new ForbiddenException(PHOTO_SERVICE_ERRORS.MULTIPART_FORBIDDEN(photoId));
    }

    const { event, ...rest } = photo;
    void event;
    return rest;
  }

  private requireOpenUpload(photo: Photo): OpenMultipartUpload {
    if (
      photo.status !== PhotoStatus.PENDING ||
      photo.multipartUploadId === null ||
      photo.multipartPartSizeBytes === null
    ) {
      throw new NotFoundException(PHOTO_SERVICE_ERRORS.MULTIPART_NOT_FOUND(photo.id));
    }
    return {
      ...photo,
      multipartUploadId: photo.multipartUploadId,
      multipartPartSizeBytes: photo.multipartPartSizeBytes,
    };
  }

  /** The parts S3 holds for the upload, by part number. An upload S3 has forgotten is released and reported gone. */
  private async listUploadedParts(
    upload: OpenMultipartUpload,
    callerId: string,
  ): Promise<Map<number, MultipartPartSummary>> {
    const listed = await this.s3Service.listMultipartParts({ key: upload.s3Key, uploadId: upload.multipartUploadId });
    if (!listed.exists) return this.expire(upload, callerId);
    return new Map(listed.parts.map((part) => [part.partNumber, part]));
  }

  /**
   * S3 no longer has the upload: the bucket's lifecycle rule aborts multipart
   * uploads after a day. Nothing can land on the key any more, so the slot
   * is released right away and the client starts over.
   */
  private async expire(upload: OpenMultipartUpload, callerId: string): Promise<never> {
    await this.photosService.releaseUploadSlots([{ id: upload.id, s3Key: upload.s3Key, multipartUploadId: null }], {
      event: "photo.multipart.expired",
      eventId: upload.eventId,
      callerId,
    });
    throw new GoneException(PHOTO_SERVICE_ERRORS.MULTIPART_EXPIRED(upload.id));
  }

  private async buildState(
    upload: UploadLayout,
    uploaded: Map<number, MultipartPartSummary>,
  ): Promise<MultipartUploadState> {
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);
    const parts = await Promise.all(
      planMultipartParts(upload.sizeBytes, upload.multipartPartSizeBytes).map(async (part) => ({
        partNumber: part.partNumber,
        sizeBytes: part.sizeBytes,
        // Every part gets a URL, done or not: re-sending a part replaces it,
        // which is the safe move for a part the client is unsure about.
        uploadUrl: await this.s3Service.getPresignedUploadPartUrl({
          key: upload.s3Key,
          uploadId: upload.multipartUploadId,
          partNumber: part.partNumber,
          contentLength: part.sizeBytes,
          expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        }),
        uploaded: uploaded.get(part.partNumber)?.sizeBytes === part.sizeBytes,
      })),
    );

    return {
      photoId: upload.id,
      sizeBytes: upload.sizeBytes,
      partSizeBytes: upload.multipartPartSizeBytes,
      expiresAt,
      parts,
    };
  }
}
