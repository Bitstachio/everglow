import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";
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
}
