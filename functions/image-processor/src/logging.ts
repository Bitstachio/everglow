import pino, { type DestinationStream, type Logger } from "pino";

/** Standalone Lambda logging; no Nest bootstrap or HTTP middleware in this runtime. */
export const createLogger = (env = process.env, destination?: DestinationStream): Logger => {
  const nodeEnv = env.NODE_ENV ?? "development";
  return pino(
    {
      level: env.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : nodeEnv === "production" ? "info" : "debug"),
      base: { service: "everglow-image-processor", env: nodeEnv },
      // Match the API's field redaction. Raw events and image bytes are never logged.
      redact: {
        paths: [
          "password",
          "*.password",
          "token",
          "*.token",
          "accessToken",
          "*.accessToken",
          "refreshToken",
          "*.refreshToken",
          "secret",
          "*.secret",
          "apiKey",
          "*.apiKey",
          "email",
          "*.email",
        ],
        censor: "[REDACTED]",
      },
    },
    destination,
  );
};
