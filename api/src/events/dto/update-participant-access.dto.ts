import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { AccessLevel } from "generated/prisma/client";

export class UpdateParticipantAccessDto {
  @ApiProperty({ enum: AccessLevel, enumName: "AccessLevel" })
  @IsEnum(AccessLevel)
  accessLevel: AccessLevel;
}
