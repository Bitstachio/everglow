import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { ReportQueue, ReportStatus } from "generated/prisma/client";
import { CursorPageQueryDto } from "src/common/pagination/cursor-page-query.dto";

export class ListPlatformReportsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({
    enum: ReportQueue,
    enumName: "ReportQueue",
    default: ReportQueue.PLATFORM,
    description: "Whose queue. The platform can read the organizers' queue too.",
  })
  @IsOptional()
  @IsEnum(ReportQueue)
  queue?: ReportQueue;

  @ApiPropertyOptional({ enum: ReportStatus, enumName: "ReportStatus", default: ReportStatus.OPEN })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ format: "uuid", description: "Only this event's reports." })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
