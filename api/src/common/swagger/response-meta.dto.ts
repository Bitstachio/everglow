import { ApiProperty } from "@nestjs/swagger";

export class ResponseMetaDto {
  @ApiProperty({ example: "2026-06-03T12:00:00.000Z" })
  timestamp: string;

  @ApiProperty({ example: "/api/v2/auth/signin" })
  path: string;
}
