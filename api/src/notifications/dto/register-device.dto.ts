import { ApiProperty } from "@nestjs/swagger";
import { DevicePlatform } from "generated/prisma/client";
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { EXPO_PUSH_TOKEN_PATTERN } from "../notifications.constants";

export class RegisterDeviceDto {
  @ApiProperty({
    description:
      "The Expo push token from getExpoPushTokenAsync, e.g. ExponentPushToken[xxxx]. Sent in the body, not the " +
      "path, so it never lands in access logs.",
    example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  @Matches(EXPO_PUSH_TOKEN_PATTERN, { message: "token must be an Expo push token" })
  token: string;

  @ApiProperty({ enum: DevicePlatform, enumName: "DevicePlatform" })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @ApiProperty({
    required: false,
    description: "The phone's language as a BCP 47 tag, e.g. en-CA. Kept for translated notifications.",
    example: "en-CA",
    maxLength: 35,
  })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  @Matches(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/, { message: "locale must be a BCP 47 language tag" })
  locale?: string;
}
