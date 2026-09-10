import { ApiProperty } from "@nestjs/swagger";
import type { ConfirmPhotoStatus } from "../photos.constants";
import { CONFIRM_PHOTO_STATUSES } from "../photos.constants";

export class ConfirmPhotoResultDto {
  @ApiProperty({ format: "uuid" })
  photoId: string;

  @ApiProperty({
    enum: Object.values(CONFIRM_PHOTO_STATUSES),
    example: CONFIRM_PHOTO_STATUSES.READY,
    description:
      "READY: the object was verified and the photo is now visible. " +
      "MISSING: no object was uploaded; the slot has been released, mint a new one. " +
      "MISMATCHED: the object differs from the declared size or type; it and the slot have been removed, mint a new one. " +
      "NOT_FOUND: not a pending upload of the caller in this event.",
  })
  status: ConfirmPhotoStatus;
}
