import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { S3Service } from "./s3.service";

/**
 * Runs the real presigner (no network: SigV4 is pure crypto) because what
 * matters here is which request headers end up in X-Amz-SignedHeaders. The
 * S3 presigner leaves content-type unsigned unless told otherwise, so a
 * mocked getSignedUrl cannot prove the URL is bound to the declared shape.
 */
describe("S3Service presigned URLs (real signer)", () => {
  const bucket = "everglow-test";
  let service: S3Service;

  const signedHeaders = (url: string) => new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];

  beforeEach(async () => {
    const configValues: Record<string, string> = {
      "aws.region": "us-east-1",
      "aws.s3Bucket": bucket,
      "aws.accessKeyId": "AKIA_TEST",
      "aws.secretAccessKey": "SECRET_TEST",
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
            getOrThrow: jest.fn((key: string) => configValues[key]),
          },
        },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(S3Service);
  });

  it("signs the content type and length into an upload URL", async () => {
    const url = await service.getPresignedUploadUrl({
      key: "photos/a/b/c",
      contentType: "image/jpeg",
      contentLength: 1024,
      expiresInSeconds: 60,
    });

    const parsed = new URL(url);
    expect(parsed.hostname).toBe(`${bucket}.s3.us-east-1.amazonaws.com`);
    expect(parsed.pathname).toBe("/photos/a/b/c");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(signedHeaders(url)).toEqual(["content-length", "content-type", "host"]);
  });

  it("signs only the host into a download URL", async () => {
    const url = await service.getPresignedDownloadUrl({ key: "photos/a/b/c", expiresInSeconds: 900 });

    expect(signedHeaders(url)).toEqual(["host"]);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("900");
  });
});
