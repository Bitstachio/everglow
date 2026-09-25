import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import type { UsernameAvailabilityReason } from "../username";

export class UsernameAvailabilityResponseDto {
  @ApiProperty({
    example: "jane.doe",
    maxLength: STRING_LIMITS.USERNAME,
    description: "Normalized candidate (trimmed and lowercased)",
  })
  username: string;

  @ApiProperty({ example: true })
  available: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ["INVALID_FORMAT", "TAKEN", "RESERVED"],
    description: "Why the username is unavailable; null when available",
  })
  reason: UsernameAvailabilityReason;
}
