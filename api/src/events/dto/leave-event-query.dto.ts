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
      "What happens to the photos you uploaded to this event. KEEP (default): they stay in the event and keep " +
      "counting toward your storage; you can still delete them later with DELETE /photos/:photoId. " +
      "DELETE: they are all deleted now and the space is freed.",
  })
  @IsOptional()
  @IsIn(PHOTOS)
  photos?: MemberPhotos;
}
