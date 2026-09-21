import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Equals, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class CreateUserDetailsDto {
  @ApiProperty({ example: "Jane Doe", maxLength: STRING_LIMITS.STANDARD })
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.STANDARD)
  name: string;

  @ApiProperty({ example: "user@example.com", maxLength: STRING_LIMITS.STANDARD })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.STANDARD)
  email: string;

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
