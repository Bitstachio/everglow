import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { CaslModule } from "./casl/casl.module";
import auth0Config from "./config/auth0.config";
import awsConfig from "./config/aws.config";
import encryptionConfig from "./config/encryption.config";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [auth0Config, awsConfig, encryptionConfig],
      envFilePath: ".env",
    }),
    AuthModule,
    UsersModule,
    CaslModule,
    PrismaModule,
    LoggerModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
