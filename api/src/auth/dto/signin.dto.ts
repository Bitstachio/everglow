import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SigninDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
