import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
  DEFAULT_NOTIFICATION_DEVICE_STALE_DAYS,
  DEFAULT_NOTIFICATION_MAX_ATTEMPTS,
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
} from "src/notifications/notifications.constants";

export default registerAs("notifications", () => ({
  // On unless switched off. It only sends to phones registered in this
  // database, so a local or compose API reaches the developer's own phone
  // and nobody else's. Off, notifications queue up and nothing is sent.
  senderEnabled: process.env.NOTIFICATIONS_SENDER_ENABLED !== "false",
  // Required by Expo once "enhanced push security" is on for the project.
  // A secret: deploy config only, never the repo.
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  maxAttempts: parseIntegerEnv(process.env.NOTIFICATION_MAX_ATTEMPTS, DEFAULT_NOTIFICATION_MAX_ATTEMPTS, 1),
  retentionDays: parseIntegerEnv(process.env.NOTIFICATION_RETENTION_DAYS, DEFAULT_NOTIFICATION_RETENTION_DAYS, 1),
  deviceStaleDays: parseIntegerEnv(
    process.env.NOTIFICATION_DEVICE_STALE_DAYS,
    DEFAULT_NOTIFICATION_DEVICE_STALE_DAYS,
    1,
  ),
}));
