import { ConfigService } from "@nestjs/config";
import type { StringValue } from "ms";

export function getJwtSecret(configService: ConfigService): string {
  return configService.getOrThrow<string>("jwt.secret");
}

export function getJwtRefreshSecret(configService: ConfigService): string {
  return configService.getOrThrow<string>("jwt.refreshSecret");
}

export function getJwtAccessExpiresIn(configService: ConfigService): StringValue {
  return (configService.get<string>("jwt.accessExpiration") || "15m") as StringValue;
}

export function getJwtRefreshExpiresIn(configService: ConfigService): StringValue {
  return (configService.get<string>("jwt.refreshExpiration") || "7d") as StringValue;
}
