import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { ReportStatus } from "generated/prisma/client";
import { CursorPageQueryDto } from "src/common/pagination/cursor-page-query.dto";

export class ListReportsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus, enumName: "ReportStatus", description: "Omit for every status." })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
