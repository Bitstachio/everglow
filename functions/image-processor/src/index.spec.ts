import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Context, SQSEvent } from "aws-lambda";
import sharp from "sharp";
import { createHandler } from "./index.js";
import { createLogger } from "./logging.js";
import { derivedKeysForOriginal } from "./keys.js";

const s3 = new S3Client({});
const handler = createHandler(s3, createLogger({ NODE_ENV: "test" }));

const key = "photos/user/event/photo";
const derived = Object.values(derivedKeysForOriginal(key));
const missing = Object.assign(new Error("missing"), {
  $metadata: { httpStatusCode: 404 },
});
const denied = Object.assign(new Error("denied"), {
  $metadata: { httpStatusCode: 403 },
});
const event = (name = "ObjectCreated:Put", objectKey = key, id = "message"): SQSEvent => ({
  Records: [
    {
      messageId: id,
      body: JSON.stringify({
        Records: [
          {
            eventName: name,
            s3: { bucket: { name: "test-bucket" }, object: { key: objectKey } },
          },
        ],
      }),
    },
  ] as SQSEvent["Records"],
});
const run = (input: SQSEvent) => handler(input, {} as never, () => undefined);
/** Run through a production-level logger and return the parsed log lines. */
const runLogged = async (input: SQSEvent) => {
  const lines: string[] = [];
  const logger = createLogger({ NODE_ENV: "production" }, { write: (line) => void lines.push(line) });
  const result = await createHandler(s3, logger)(input, { awsRequestId: "invocation" } as Context, () => undefined);
  return { result, raw: lines.join(""), logs: lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
};
const hevcHeic = readFileSync(path.join(__dirname, "fixtures", "hevc-16x16.heic"));
let input: Buffer;
before(async () => {
  input = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
});

void test("logs a failed message once with correlation fields and without its raw payload", async () => {
  const lines: string[] = [];
  const logger = createLogger(
    { NODE_ENV: "production" },
    {
      write: (line) => {
        lines.push(line);
      },
    },
  );
  const input = event();
  input.Records[0]!.body = '{"token":"credential-value","email":"private@example.com",';
  const result = await createHandler(s3, logger)(input, { awsRequestId: "invocation" } as Context, () => undefined);
  assert.deepEqual(result, { batchItemFailures: [{ itemIdentifier: "message" }] });
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(line.event, "photo.derivatives.failed");
  assert.equal(line.awsRequestId, "invocation");
  assert.equal(line.messageId, "message");
  assert.equal(line.errorType, "SyntaxError");
  assert.ok(!lines[0]!.includes("credential-value"));
  assert.ok(!lines[0]!.includes("private@example.com"));
});

void test("an undecodable HEIC is logged once with its object and acknowledged without writes", async (t) => {
  const calls: string[] = [];
  t.mock.method(s3, "send", async (command: GetObjectCommand) => {
    calls.push(command.constructor.name);
    return { ContentLength: hevcHeic.byteLength, Body: { transformToByteArray: async () => hevcHeic } };
  });
  const { result, logs } = await runLogged(event());
  assert.deepEqual(result, { batchItemFailures: [] });
  assert.deepEqual(calls, ["GetObjectCommand"]);
  assert.equal(logs.length, 1);
  const [line] = logs;
  assert.equal(line!.level, 40);
  assert.equal(line!.event, "photo.derivatives.undecodable");
  assert.equal(line!.awsRequestId, "invocation");
  assert.equal(line!.messageId, "message");
  assert.equal(line!.bucket, "test-bucket");
  assert.equal(line!.key, key);
  assert.equal(line!.reason, "unsupported_format");
  assert.match(line!.errorMessage as string, /HEVC/);
  assert.doesNotMatch(line!.errorMessage as string, /bad seek/);
});

void test("an empty original is acknowledged as undecodable", async (t) => {
  t.mock.method(s3, "send", async () => ({ ContentLength: 0, Body: Buffer.alloc(0) }));
  const { result, logs } = await runLogged(event());
  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]!.reason, "empty");
});

void test("a transient S3 failure retries and logs its object, type and status but not the SDK message", async (t) => {
  t.mock.method(s3, "send", async (command: GetObjectCommand) => {
    if (command.input.Key === key) {
      throw Object.assign(new Error("Please reduce your request rate. RequestId: secret-request-id"), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      });
    }
    return { ContentLength: hevcHeic.byteLength, Body: hevcHeic };
  });
  // The second message is undecodable: the batch retries only the transient one.
  const input = event();
  input.Records.push(...event("ObjectCreated:Put", "photos/user/event/heic", "heic").Records);
  const { result, logs, raw } = await runLogged(input);
  assert.deepEqual(result, { batchItemFailures: [{ itemIdentifier: "message" }] });
  const failed = logs.filter((line) => line.event === "photo.derivatives.failed");
  assert.equal(failed.length, 1);
  assert.equal(failed[0]!.level, 50);
  assert.equal(failed[0]!.bucket, "test-bucket");
  assert.equal(failed[0]!.key, key);
  assert.equal(failed[0]!.errorType, "SlowDown");
  assert.equal(failed[0]!.httpStatusCode, 503);
  assert.equal(failed[0]!.errorMessage, undefined);
  assert.ok(!raw.includes("secret-request-id"));
  assert.deepEqual(
    logs.filter((line) => line.event === "photo.derivatives.undecodable").map((line) => line.key),
    ["photos/user/event/heic"],
  );
});

void test("a worker-written transient failure logs its message", async (t) => {
  t.mock.method(s3, "send", async () => ({ ContentLength: 10, Body: undefined }));
  const { result, logs } = await runLogged(event());
  assert.deepEqual(result, { batchItemFailures: [{ itemIdentifier: "message" }] });
  assert.equal(logs[0]!.errorType, "PhotoProcessingError");
  assert.equal(logs[0]!.errorMessage, "S3 GetObject returned no body");
});

void test("writes both renditions and checks the original after both writes settle", async (t) => {
  const calls: string[] = [];
  t.mock.method(s3, "send", async (command: GetObjectCommand | PutObjectCommand | HeadObjectCommand) => {
    calls.push(command.constructor.name);
    if (command instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => input } };
    if (command instanceof PutObjectCommand) {
      assert.ok(derived.includes(command.input.Key!));
      const metadata = await sharp(command.input.Body as Buffer).metadata();
      assert.equal(metadata.format, command.input.ContentType === "image/webp" ? "webp" : "jpeg");
    }
    return {};
  });
  assert.deepEqual(await run(event()), { batchItemFailures: [] });
  assert.deepEqual(calls, ["GetObjectCommand", "PutObjectCommand", "PutObjectCommand", "HeadObjectCommand"]);
});

for (const name of ["ObjectRemoved:Delete", "ObjectCreated:Put"]) {
  void test(`${name}: a missing original cleans both derivatives without retry`, async (t) => {
    const deleted: string[] = [];
    t.mock.method(s3, "send", async (command: GetObjectCommand | HeadObjectCommand | DeleteObjectCommand) => {
      if (command instanceof DeleteObjectCommand) {
        deleted.push(command.input.Key!);
        return {};
      }
      throw missing;
    });
    assert.deepEqual(await run(event(name)), { batchItemFailures: [] });
    assert.deepEqual(deleted.sort(), [...derived].sort());
  });
}

void test("deletion during a partial write waits for the other write then removes both copies", async (t) => {
  const calls: string[] = [];
  t.mock.method(
    s3,
    "send",
    async (command: GetObjectCommand | PutObjectCommand | HeadObjectCommand | DeleteObjectCommand) => {
      if (command instanceof GetObjectCommand) return { Body: input };
      if (command instanceof PutObjectCommand) {
        if (command.input.Key === derived[0]) throw new Error("put failed");
        await new Promise((resolve) => setTimeout(resolve, 10));
        calls.push("write settled");
        return {};
      }
      if (command instanceof HeadObjectCommand) {
        calls.push("check");
        throw missing;
      }
      calls.push(command.input.Key!);
      return {};
    },
  );
  assert.deepEqual(await run(event()), { batchItemFailures: [] });
  assert.deepEqual(calls, ["write settled", "check", ...derived]);
});

void test("a stale removal leaves a re-uploaded original's derivatives intact", async (t) => {
  const send = t.mock.method(s3, "send", async (command: HeadObjectCommand) => {
    assert.ok(command instanceof HeadObjectCommand);
    return {};
  });
  assert.deepEqual(await run(event("ObjectRemoved:Delete")), {
    batchItemFailures: [],
  });
  assert.equal(send.mock.callCount(), 1);
});

for (const name of ["ObjectCreated:Put", "ObjectRemoved:Delete"]) {
  void test(`${name}: access denied retries and never deletes copies`, async (t) => {
    t.mock.method(s3, "send", async (command: GetObjectCommand | HeadObjectCommand) => {
      assert.ok(!(command instanceof DeleteObjectCommand));
      throw denied;
    });
    assert.deepEqual(await run(event(name)), {
      batchItemFailures: [{ itemIdentifier: "message" }],
    });
  });
}

void test("partial cleanup failure retries only its message and continues the batch", async (t) => {
  t.mock.method(s3, "send", async (command: HeadObjectCommand | DeleteObjectCommand) => {
    if (command instanceof HeadObjectCommand) throw missing;
    if (command.input.Key === derived[0]) throw denied;
    return {};
  });
  const input = event("ObjectRemoved:Delete");
  input.Records.push(...event("ObjectCreated:Put", "derived/photos/ignored/thumb.webp", "ignored").Records);
  assert.deepEqual(await run(input), {
    batchItemFailures: [{ itemIdentifier: "message" }],
  });
});

void test("a failed write retries when the original still exists", async (t) => {
  t.mock.method(s3, "send", async (command: GetObjectCommand | PutObjectCommand | HeadObjectCommand) => {
    if (command instanceof GetObjectCommand) return { Body: input };
    if (command instanceof PutObjectCommand) throw denied;
    return {};
  });
  assert.deepEqual(await run(event()), {
    batchItemFailures: [{ itemIdentifier: "message" }],
  });
});

void test("decodes URL-encoded S3 keys and ignores setup notifications", async (t) => {
  const keys: string[] = [];
  t.mock.method(s3, "send", async (command: HeadObjectCommand) => {
    keys.push(command.input.Key!);
    return {};
  });
  const input = event("ObjectRemoved:Delete", "photos/user/event/a+b%2Bc");
  input.Records.push({
    messageId: "setup",
    body: JSON.stringify({ Event: "s3:TestEvent" }),
  } as SQSEvent["Records"][number]);
  assert.deepEqual(await run(input), { batchItemFailures: [] });
  assert.deepEqual(keys, ["photos/user/event/a b+c"]);
});
