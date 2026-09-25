import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
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
}
