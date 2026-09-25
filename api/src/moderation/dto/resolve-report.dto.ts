import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { REPORT_RESOLUTION_ACTIONS, type ReportResolutionAction } from "../moderation.constants";

const ACTIONS = Object.values(REPORT_RESOLUTION_ACTIONS);

export class ResolveReportDto {
  @ApiProperty({
    enum: ACTIONS,
    enumName: "ReportResolutionAction",
    description:
      "REMOVE_PHOTO: delete the reported photo. REMOVE_MEMBER: remove the reported member from the event, " +
      "and the reported photo too when the report is about one. DISMISS: nothing was wrong; hidden content returns. " +
      "Every action closes all OPEN reports on the same target.",
  })
  @IsIn(ACTIONS)
  action: ReportResolutionAction;
}
