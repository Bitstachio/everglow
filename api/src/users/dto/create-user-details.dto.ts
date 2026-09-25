import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { Equals, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { USERNAME_PATTERN } from "../users.constants";

export class CreateUserDetailsDto {
  @ApiProperty({ example: "Jane Doe", maxLength: STRING_LIMITS.STANDARD })
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.STANDARD)
  name: string;

  @ApiProperty({
    example: "jane.doe",
    minLength: 3,
    maxLength: STRING_LIMITS.USERNAME,
    description: "Public handle. Trimmed and lowercased before validation.",
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(STRING_LIMITS.USERNAME)
  @Matches(USERNAME_PATTERN, {
    message: "Username must use only lowercase letters, numbers, periods, or underscores",
  })
  username: string;

  // Optional only until the mobile onboarding sends it; then it becomes
  // required. Omitting it onboards the account with termsAcceptedAt null.
  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description:
      "The user accepted the terms of use, which forbid objectionable content and abusive behaviour. " +
      "Only `true` is valid; when sent, the acceptance time is recorded as termsAcceptedAt.",
  })
  @IsOptional()
  @Equals(true)
  acceptedTerms?: true;
}
