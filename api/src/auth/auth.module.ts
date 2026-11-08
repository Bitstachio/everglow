import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "src/users/users.module";
import { JwtStrategy } from "./jwt.strategy";
import { SigningKeySet } from "./signing-key-set";

@Module({
  imports: [PassportModule, UsersModule],
  providers: [SigningKeySet, JwtStrategy],
})
export class AuthModule {}
