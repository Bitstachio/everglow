import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class UsernameAvailabilityQueryDto {
  @ApiProperty({
    example: "jane.doe",
    maxLength: STRING_LIMITS.USERNAME,
    description: "Candidate username. Normalized (trim + lowercase) in the response.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.USERNAME)
  username: string;

  @ApiPropertyOptional({
    example: "Jane Smith",
    maxLength: STRING_LIMITS.STANDARD,
    description: "The person's name. When the username is taken or reserved, suggestions are built from it too.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(STRING_LIMITS.STANDARD)
  name?: string;
}
