import { Module } from "@nestjs/common";
import { S3Module } from "src/sdk/aws/s3/s3.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [S3Module],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
