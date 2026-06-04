import { ConfigService } from "@nestjs/config";
import type { StringValue } from "ms";

function requireConfigValue(configService: ConfigService, key: string, envVar: string): string {
  const value = configService.get<string>(key);
  if (!value) {
    throw new Error(
      `Missing ${envVar} (config key "${key}"). Copy api/.env.example to api/.env and set your JWT secrets.`,
    );
  }
  return value;
}

export function getJwtSecret(configService: ConfigService): string {
  return requireConfigValue(configService, "jwt.secret", "JWT_SECRET");
}

export function getJwtRefreshSecret(configService: ConfigService): string {
  return requireConfigValue(configService, "jwt.refreshSecret", "JWT_REFRESH_SECRET");
}

export function getJwtAccessExpiresIn(configService: ConfigService): StringValue {
  return (configService.get<string>("jwt.accessExpiration") || "15m") as StringValue;
}

export function getJwtRefreshExpiresIn(configService: ConfigService): StringValue {
  return (configService.get<string>("jwt.refreshExpiration") || "7d") as StringValue;
}
