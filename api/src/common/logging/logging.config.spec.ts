import { createServer, type ServerResponse } from "http";
import { Writable } from "stream";
import type { ConfigService } from "@nestjs/config";
import { pinoHttp, type Options } from "pino-http";
import request from "supertest";
import { recordErrorLogFields } from "./error-log-fields";
import { buildLoggerConfig } from "./logging.config";
import { inviteTokenHash } from "./redact-url";

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
const logLinesFor = async (respond: (res: ServerResponse) => void, shape?: RequestShape): Promise<LogLine[]> =>
  (await completedRequest(respond, shape)).lines;

type RequestShape = { path?: string; headers?: Record<string, string> };

/** The lines logged for one request, and the request id the response carried. */
const completedRequest = async (
  respond: (res: ServerResponse) => void,
  { path = "/api/v2/events/66666666-6666-6666-6666-666666666666", headers = {} }: RequestShape = {},
): Promise<{ lines: LogLine[]; responseRequestId: unknown }> => {
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

  const response = await request(server).get(path).set(headers);
  // The completion line is written when the response finishes.
  await new Promise((resolve) => setImmediate(resolve));
  return { lines, responseRequestId: response.headers["x-request-id"] };
};

const ok = (res: ServerResponse) => {
  res.statusCode = 200;
  res.end();
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    it("names an invite preview by the token's hash, never the token", async () => {
      const token = "0f8c2f4e-5b1a-4c3d-9e7f-123456789abc";

      const lines = await logLinesFor(ok, { path: `/api/v2/events/invites/${token}/preview?ref=share` });

      expect(lines[0]).toMatchObject({
        req: { url: `/api/v2/events/invites/sha256:${inviteTokenHash(token)}/preview?ref=share` },
      });
      expect(JSON.stringify(lines)).not.toContain(token);
    });
  });

  describe("the request id", () => {
    const upstreamId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

    it("keeps an upstream x-request-id that is a UUID, and echoes it", async () => {
      const { lines, responseRequestId } = await completedRequest(ok, { headers: { "x-request-id": upstreamId } });

      expect(lines[0]).toMatchObject({ req: { id: upstreamId } });
      expect(responseRequestId).toBe(upstreamId);
    });

    it("keeps an x-correlation-id that is a UUID", async () => {
      const { lines } = await completedRequest(ok, { headers: { "x-correlation-id": upstreamId } });

      expect(lines[0]).toMatchObject({ req: { id: upstreamId } });
    });

    it.each([
      ["a forged string", "admin-audit-0001"],
      ["a very long value", "a".repeat(4096)],
      ["a UUID with more around it", `${upstreamId} or 1=1`],
    ])("replaces %s with a fresh UUID, and echoes that", async (_case, value) => {
      const { lines, responseRequestId } = await completedRequest(ok, { headers: { "x-request-id": value } });
      const id = (lines[0].req as { id: string }).id;

      expect(id).toMatch(UUID);
      expect(id).not.toBe(value);
      expect(responseRequestId).toBe(id);
    });

    it("mints one when no header is sent", async () => {
      const { lines } = await completedRequest(ok);

      expect((lines[0].req as { id: string }).id).toMatch(UUID);
    });
  });
});
