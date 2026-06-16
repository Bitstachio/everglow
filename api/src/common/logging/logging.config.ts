import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import type { ConfigService } from "@nestjs/config";
import type { Params } from "nestjs-pino";

/**
 * Centralized nestjs-pino configuration: the single "shared logging facade"
 * every layer logs through. Wiring redaction, correlation IDs, and level
 * policy here (rather than at each call site) is what makes our logging safe
 * and consistent by default. See docs/logging-conventions.md.
 */

const REQUEST_ID_HEADER = "x-request-id";
const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * Routes that are too chatty to log per-request. Health checks and metrics
 * scrapes run on a tight interval and add only noise to the ingress stream.
 */
const SILENCED_ROUTES = new Set(["/health", "/api/health", "/metrics", "/api/metrics"]);

/**
 * Fields that must NEVER reach the log stream in cleartext. Redaction is
 * enforced once, here, so no individual log call can leak secrets or PII
 * regardless of which layer emits it. Keys are matched both at the top level
 * and one level deep (`*.key`) to catch nested payloads.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
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
  // PII safety net: we log opaque IDs, never contact details.
  "email",
  "*.email",
];

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const buildLoggerConfig = (config: ConfigService): Params => {
  const env = config.get<string>("NODE_ENV") ?? "development";
  const isProduction = env === "production";
  const level = config.get<string>("LOG_LEVEL") ?? (isProduction ? "info" : "debug");

  return {
    pinoHttp: {
      level,
      // Static context stamped on every line, so an operator can tell which
      // service and environment emitted an event without guessing.
      base: { service: "everglow-api", env },
      // Honour an upstream correlation id when present (so a request keeps the
      // same id across services); otherwise mint one. The id is reflected back
      // on the response and auto-attached to every log within the request.
      genReqId: (req: IncomingMessage, res: ServerResponse): string => {
        const incoming = firstHeader(req.headers[REQUEST_ID_HEADER]) ?? firstHeader(req.headers[CORRELATION_ID_HEADER]);
        const id = incoming ?? randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      // Lean ingress bookends: route + status only, never the full header bag,
      // query string, or body.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      // Severity is driven by outcome, not by where the log was written:
      // 5xx/throw => error, 4xx => warn (expected client errors), else info.
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => SILENCED_ROUTES.has(req.url ?? ""),
      },
      // Human-friendly, colorized output for local dev; raw JSON in production
      // so log aggregators can index it.
      ...(isProduction
        ? {}
        : {
            transport: {
              target: "pino-pretty",
              options: {
                singleLine: true,
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
              },
            },
          }),
    },
  };
};
