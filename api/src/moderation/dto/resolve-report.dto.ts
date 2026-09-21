import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { REPORT_RESOLUTIONS, type ReportResolution } from "../moderation.constants";

export class ResolveReportDto {
  @ApiProperty({
    enum: REPORT_RESOLUTIONS,
    enumName: "ReportResolution",
    description:
      "ACTIONED: the organizer dealt with the target (deleted the photo, removed the member). " +
      "DISMISSED: nothing was wrong. Neither deletes anything by itself; both end the report's hiding effect.",
  })
  @IsIn(REPORT_RESOLUTIONS)
  status: ReportResolution;
}
