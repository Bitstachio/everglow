import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { USERNAME_PATTERN } from "../users.constants";

export class CreateUserDetailsDto {
  @ApiProperty({ example: "Jane Doe", maxLength: STRING_LIMITS.STANDARD })
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.STANDARD)
  name: string;

  @ApiPropertyOptional({
    example: "jane.doe",
    minLength: 3,
    maxLength: STRING_LIMITS.USERNAME,
    description:
      "Public handle. Trimmed and lowercased before validation. Optional while installed apps still onboard with email only; when omitted the API derives one from the email local part.",
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(STRING_LIMITS.USERNAME)
  @Matches(USERNAME_PATTERN, {
    message: "Username must use only lowercase letters, numbers, periods, or underscores",
  })
  username?: string;

  @ApiPropertyOptional({
    example: "user@example.com",
    maxLength: STRING_LIMITS.STANDARD,
    description: "Optional once clients send username. Still accepted for installed apps; Auth0 holds the login email.",
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(STRING_LIMITS.STANDARD)
  email?: string;
}
