import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class CreateUserDetailsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.STANDARD)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.STANDARD)
  email: string;
}
