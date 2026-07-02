import { ApiProperty } from "@nestjs/swagger";
import { CONFIRM_PHOTO_STATUSES, ConfirmPhotoStatus } from "../photos.constants";

export class ConfirmPhotoResultDto {
  @ApiProperty({ format: "uuid" })
  photoId: string;

  @ApiProperty({ enum: Object.values(CONFIRM_PHOTO_STATUSES), example: CONFIRM_PHOTO_STATUSES.READY })
  status: ConfirmPhotoStatus;
}
