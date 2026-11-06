import { ApiProperty } from "@nestjs/swagger";
import { DevicePlatform } from "generated/prisma/client";

/** A registered phone. The push token is never returned. */
export class DeviceResponseDto {
  @ApiProperty({ format: "uuid", description: "Keep it to unregister this phone on sign-out." })
  id: string;

  @ApiProperty({ enum: DevicePlatform, enumName: "DevicePlatform" })
  platform: DevicePlatform;

  @ApiProperty({ type: String, nullable: true })
  locale: string | null;

  @ApiProperty()
  lastSeenAt: Date;
}
