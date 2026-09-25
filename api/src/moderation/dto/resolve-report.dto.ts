import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { REMOVED_MEMBER_PHOTOS, type RemovedMemberPhotos } from "src/events/event-membership";
import { REPORT_RESOLUTION_ACTIONS, type ReportResolutionAction } from "../moderation.constants";

const ACTIONS = Object.values(REPORT_RESOLUTION_ACTIONS);
const PHOTOS = Object.values(REMOVED_MEMBER_PHOTOS);

export class ResolveReportDto {
  @ApiProperty({
    enum: ACTIONS,
    enumName: "ReportResolutionAction",
    description:
      "REMOVE_PHOTO: delete the reported photo. REMOVE_MEMBER: remove the reported member from the event and ban " +
      "them from rejoining through the invitation link, deleting the reported photo too when the report is about " +
      "one. DISMISS: nothing was wrong; hidden content returns. Every action closes all OPEN reports on the same target.",
  })
  @IsIn(ACTIONS)
  action: ReportResolutionAction;

  @ApiPropertyOptional({
    enum: PHOTOS,
    enumName: "RemovedMemberPhotos",
    default: REMOVED_MEMBER_PHOTOS.KEEP,
    description:
      "REMOVE_MEMBER only (400 with any other action): what happens to the other photos the member uploaded to " +
      "this event. KEEP (default): they stay. DELETE: they are all deleted, and their open reports are closed.",
  })
  @IsOptional()
  @IsIn(PHOTOS)
  photos?: RemovedMemberPhotos;
}
