import notificationsConfig from "./notifications.config";
import {
  DEFAULT_NOTIFICATION_DEVICE_STALE_DAYS,
  DEFAULT_NOTIFICATION_MAX_ATTEMPTS,
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
} from "src/notifications/notifications.constants";

describe("notificationsConfig", () => {
  const MANAGED_VARS = [
    "NOTIFICATIONS_SENDER_ENABLED",
    "EXPO_ACCESS_TOKEN",
    "NOTIFICATION_MAX_ATTEMPTS",
    "NOTIFICATION_RETENTION_DAYS",
    "NOTIFICATION_DEVICE_STALE_DAYS",
  ] as const;
  const original = new Map(MANAGED_VARS.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    for (const name of MANAGED_VARS) delete process.env[name];
  });

  afterAll(() => {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe("senderEnabled", () => {
    // It only reaches phones registered in this database, so it is on unless
    // the environment says exactly "false".
    it("is on by default", () => {
      expect(notificationsConfig().senderEnabled).toBe(true);
    });

    it("is off for exactly false", () => {
      process.env.NOTIFICATIONS_SENDER_ENABLED = "false";

      expect(notificationsConfig().senderEnabled).toBe(false);
    });

    it.each(["true", "0", "no", "FALSE", ""])("stays on for %p", (value) => {
      process.env.NOTIFICATIONS_SENDER_ENABLED = value;

      expect(notificationsConfig().senderEnabled).toBe(true);
    });
  });

  describe("expoAccessToken", () => {
    it("is undefined when unset or empty", () => {
      expect(notificationsConfig().expoAccessToken).toBeUndefined();
      process.env.EXPO_ACCESS_TOKEN = "";
      expect(notificationsConfig().expoAccessToken).toBeUndefined();
    });

    it("reads a set token", () => {
      process.env.EXPO_ACCESS_TOKEN = "token-value";

      expect(notificationsConfig().expoAccessToken).toBe("token-value");
    });
  });

  describe("bounds", () => {
    it("falls back to the defaults when unset", () => {
      const config = notificationsConfig();

      expect(config.maxAttempts).toBe(DEFAULT_NOTIFICATION_MAX_ATTEMPTS);
      expect(config.retentionDays).toBe(DEFAULT_NOTIFICATION_RETENTION_DAYS);
      expect(config.deviceStaleDays).toBe(DEFAULT_NOTIFICATION_DEVICE_STALE_DAYS);
    });

    it("reads valid overrides", () => {
      process.env.NOTIFICATION_MAX_ATTEMPTS = "3";
      process.env.NOTIFICATION_RETENTION_DAYS = "30";
      process.env.NOTIFICATION_DEVICE_STALE_DAYS = "60";

      const config = notificationsConfig();

      expect(config.maxAttempts).toBe(3);
      expect(config.retentionDays).toBe(30);
      expect(config.deviceStaleDays).toBe(60);
    });

    it.each(["0", "-1", "1.5", "abc", " "])("ignores the invalid value %p", (value) => {
      process.env.NOTIFICATION_MAX_ATTEMPTS = value;
      process.env.NOTIFICATION_RETENTION_DAYS = value;
      process.env.NOTIFICATION_DEVICE_STALE_DAYS = value;

      const config = notificationsConfig();

      expect(config.maxAttempts).toBe(DEFAULT_NOTIFICATION_MAX_ATTEMPTS);
      expect(config.retentionDays).toBe(DEFAULT_NOTIFICATION_RETENTION_DAYS);
      expect(config.deviceStaleDays).toBe(DEFAULT_NOTIFICATION_DEVICE_STALE_DAYS);
    });
  });
});
