import { ApiProperty } from "@nestjs/swagger";
import { AccessLevel } from "generated/prisma/client";

export class EventParticipantResponseDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: AccessLevel, enumName: "AccessLevel" })
  accessLevel: AccessLevel;
}
