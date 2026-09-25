import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { REMOVED_MEMBER_PHOTOS, type RemovedMemberPhotos } from "../event-membership";

const PHOTOS = Object.values(REMOVED_MEMBER_PHOTOS);

export class RemoveParticipantQueryDto {
  @ApiPropertyOptional({
    enum: PHOTOS,
    enumName: "RemovedMemberPhotos",
    default: REMOVED_MEMBER_PHOTOS.KEEP,
    description:
      "What happens to the photos the member uploaded to this event. KEEP (default): they stay, still credited " +
      "to the member. DELETE: they are all deleted, and their open reports are closed. Either way the member is " +
      "banned from rejoining through the invitation link until an organizer lifts the ban.",
  })
  @IsOptional()
  @IsIn(PHOTOS)
  photos?: RemovedMemberPhotos;
}
