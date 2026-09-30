import { ApiProperty } from "@nestjs/swagger";
import { EventStorageUsageResponseDto } from "./event-storage-usage-response.dto";

export class EventStorageUsageListResponseDto {
  @ApiProperty({ type: [EventStorageUsageResponseDto], description: "Largest first" })
  items: EventStorageUsageResponseDto[];
}
