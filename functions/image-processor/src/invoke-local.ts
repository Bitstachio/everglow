import type { S3Event, SQSEvent } from "aws-lambda";

import { handler } from "./index.js";

const bucket = "everglow-photos-dev";
const key = "photos/user-id/event-id/photo-id";

const s3Event: S3Event = {
  Records: [
    {
      eventVersion: "2.1",
      eventSource: "aws:s3",
      awsRegion: "us-east-1",
      eventTime: "2026-10-23T17:00:00.000Z",
      eventName: "ObjectCreated:Put",
      userIdentity: { principalId: "local" },
      requestParameters: { sourceIPAddress: "127.0.0.1" },
      responseElements: {
        "x-amz-request-id": "local",
        "x-amz-id-2": "local",
      },
      s3: {
        s3SchemaVersion: "1.0",
        configurationId: "photo-uploads",
        bucket: {
          name: bucket,
          ownerIdentity: { principalId: "local" },
          arn: `arn:aws:s3:::${bucket}`,
        },
        object: {
          key,
          size: 2_048_000,
          eTag: "local",
          sequencer: "local",
        },
      },
    },
  ],
};

const event: SQSEvent = {
  Records: [
    {
      messageId: "local-message",
      receiptHandle: "local",
      body: JSON.stringify(s3Event),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "0",
        SenderId: "local",
        ApproximateFirstReceiveTimestamp: "0",
      },
      messageAttributes: {},
      md5OfBody: "local",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:photo-uploads",
      awsRegion: "us-east-1",
    },
  ],
};

const main = async () => {
  await handler(event, {} as never, () => undefined);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
