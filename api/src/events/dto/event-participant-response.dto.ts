import { ApiProperty } from "@nestjs/swagger";
import { AccessLevel } from "generated/prisma/client";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class EventParticipantResponseDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ example: "jane.doe", maxLength: STRING_LIMITS.USERNAME })
  username: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: AccessLevel, enumName: "AccessLevel" })
  accessLevel: AccessLevel;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: STRING_LIMITS.LONG,
    description: "Short-lived presigned URL of the member's avatar; null when none is set",
  })
  avatarUrl: string | null;
}
