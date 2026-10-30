import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "./logging.js";

void test("redacts credentials and contact fields while retaining searchable event context", () => {
  const lines: string[] = [];
  const logger = createLogger(
    { NODE_ENV: "production" },
    {
      write: (line) => {
        lines.push(line);
      },
    },
  );
  logger.child({ awsRequestId: "invocation", messageId: "message" }).info(
    {
      event: "photo.derivatives.removed",
      audit: true,
      token: "credential-value",
      details: { email: "private@example.com", secret: "secret-value" },
    },
    "Photo derivatives removed",
  );
  const line = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(line.service, "everglow-image-processor");
  assert.equal(line.env, "production");
  assert.equal(line.awsRequestId, "invocation");
  assert.equal(line.messageId, "message");
  assert.equal(line.event, "photo.derivatives.removed");
  assert.equal(line.audit, true);
  assert.equal(line.token, "[REDACTED]");
  assert.deepEqual(line.details, { email: "[REDACTED]", secret: "[REDACTED]" });
  assert.ok(!lines[0]!.includes("credential-value"));
});

void test("test logs default to silent and LOG_LEVEL explicitly enables them", () => {
  const lines: string[] = [];
  const destination = {
    write: (line: string) => {
      lines.push(line);
    },
  };
  createLogger({ NODE_ENV: "test" }, destination).info("silent");
  assert.equal(lines.length, 0);
  createLogger({ NODE_ENV: "test", LOG_LEVEL: "info" }, destination).info("enabled");
  assert.equal(lines.length, 1);
});
