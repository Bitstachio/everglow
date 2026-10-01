import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { MEMBER_PHOTOS, type MemberPhotos } from "../event-membership";

const PHOTOS = Object.values(MEMBER_PHOTOS);

export class LeaveEventQueryDto {
  @ApiPropertyOptional({
    enum: PHOTOS,
    enumName: "MemberPhotos",
    default: MEMBER_PHOTOS.KEEP,
    description:
      "What happens to the photos you uploaded to this event. KEEP (default): they stay in the event, " +
      "credited to you, until its gallery closes. DELETE: they are all deleted now, unless the gallery has " +
      "already closed, in which case nothing is deleted.",
  })
  @IsOptional()
  @IsIn(PHOTOS)
  photos?: MemberPhotos;
}
