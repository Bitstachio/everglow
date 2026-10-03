import { createServer, type ServerResponse } from "http";
import { Writable } from "stream";
import type { ConfigService } from "@nestjs/config";
import { pinoHttp, type Options } from "pino-http";
import request from "supertest";
import { recordErrorLogFields } from "./error-log-fields";
import { buildLoggerConfig } from "./logging.config";

type LogLine = Record<string, unknown> & { level: number; res?: { statusCode: number } };

// pino's numeric levels.
const WARN = 40;
const ERROR = 50;

const configWith = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

/**
 * Runs one request through pino-http built from our production config (JSON,
 * level info, no pretty transport) and returns the lines it logged.
 */
const logLinesFor = async (respond: (res: ServerResponse) => void): Promise<LogLine[]> => {
  const lines: LogLine[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as LogLine);
      done();
    },
  });
  const { pinoHttp: options } = buildLoggerConfig(configWith({ NODE_ENV: "production" }));
  const middleware = pinoHttp(options as Options, stream);
  const server = createServer((req, res) => {
    middleware(req, res);
    respond(res);
  });

  await request(server).get("/api/v2/events/66666666-6666-6666-6666-666666666666");
  // The completion line is written when the response finishes.
  await new Promise((resolve) => setImmediate(resolve));
  return lines;
};

describe("buildLoggerConfig", () => {
  describe("a request's completion line", () => {
    it("carries the code and reason AllExceptionsFilter recorded, at warn for a 4xx", async () => {
      const lines = await logLinesFor((res) => {
        recordErrorLogFields(res, { errorCode: "ORGANIZER_ONLY", errorReason: "Only organizers can update Event" });
        res.statusCode = 403;
        res.end();
      });

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        level: WARN,
        msg: "request completed",
        res: { statusCode: 403 },
        errorCode: "ORGANIZER_ONLY",
        errorReason: "Only organizers can update Event",
      });
    });

    it("carries them at error for a 5xx", async () => {
      const lines = await logLinesFor((res) => {
        recordErrorLogFields(res, { errorCode: "INTERNAL_ERROR", errorReason: "Plan f000 not found" });
        res.statusCode = 500;
        res.end();
      });

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        level: ERROR,
        res: { statusCode: 500 },
        errorCode: "INTERNAL_ERROR",
        errorReason: "Plan f000 not found",
      });
    });

    it("has no error fields when the request succeeded", async () => {
      const lines = await logLinesFor((res) => {
        res.statusCode = 200;
        res.end();
      });

      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toHaveProperty("errorCode");
      expect(lines[0]).not.toHaveProperty("errorReason");
    });
  });
});
