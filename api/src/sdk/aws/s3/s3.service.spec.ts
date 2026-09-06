import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import * as presigner from "@aws-sdk/s3-request-presigner";
import { InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { S3_SERVICE_ERRORS } from "./s3.constants";
import { S3Service } from "./s3.service";

jest.mock("@aws-sdk/s3-request-presigner");

describe("S3Service", () => {
  const bucket = "everglow-test";
  let service: S3Service;
  let sendSpy: jest.SpyInstance;
  let getSignedUrlMock: jest.MockedFunction<typeof presigner.getSignedUrl>;

  beforeEach(async () => {
    const configValues: Record<string, string | undefined> = {
      "aws.region": "us-east-1",
      "aws.s3Bucket": bucket,
      "aws.accessKeyId": "AKIA_TEST",
      "aws.secretAccessKey": "SECRET_TEST",
    };

    const configService = {
      get: jest.fn((key: string) => configValues[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = configValues[key];
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      }),
    };

    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: ConfigService, useValue: configService },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(S3Service);
    sendSpy = jest.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    getSignedUrlMock = presigner.getSignedUrl as jest.MockedFunction<typeof presigner.getSignedUrl>;
    getSignedUrlMock.mockReset();
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it("exposes the configured bucket name", () => {
    expect(service.getBucket()).toBe(bucket);
  });

  describe("configuration", () => {
    const buildConfigService = (overrides: Record<string, string | undefined>): ConfigService => {
      const values: Record<string, string | undefined> = {
        "aws.region": "us-east-1",
        "aws.s3Bucket": bucket,
        "aws.accessKeyId": "AKIA_TEST",
        "aws.secretAccessKey": "SECRET_TEST",
        ...overrides,
      };
      return {
        get: jest.fn((key: string) => values[key]),
        getOrThrow: jest.fn((key: string) => {
          const value = values[key];
          if (value === undefined) throw new Error(`Missing ${key}`);
          return value;
        }),
      } as unknown as ConfigService;
    };

    const buildLogger = (): PinoLogger =>
      ({
        setContext: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }) as unknown as PinoLogger;

    it("throws when the bucket is not configured", () => {
      expect(() => new S3Service(buildConfigService({ "aws.s3Bucket": undefined }), buildLogger())).toThrow(
        S3_SERVICE_ERRORS.BUCKET_NOT_CONFIGURED(),
      );
    });

    it("throws when the access key is missing", () => {
      expect(() => new S3Service(buildConfigService({ "aws.accessKeyId": undefined }), buildLogger())).toThrow(
        S3_SERVICE_ERRORS.CREDENTIALS_NOT_CONFIGURED(),
      );
    });

    it("throws when the secret key is missing", () => {
      expect(() => new S3Service(buildConfigService({ "aws.secretAccessKey": undefined }), buildLogger())).toThrow(
        S3_SERVICE_ERRORS.CREDENTIALS_NOT_CONFIGURED(),
      );
    });
  });

  describe("putObject", () => {
    it("sends a PutObjectCommand with the configured bucket", async () => {
      await service.putObject({ key: "a/b.jpg", body: Buffer.from("x"), contentType: "image/jpeg" });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it("wraps client errors in InternalServerErrorException", async () => {
      sendSpy.mockRejectedValueOnce(new Error("boom"));

      await expect(service.putObject({ key: "a/b.jpg", body: "x" })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe("deleteObject", () => {
    it("sends a DeleteObjectCommand", async () => {
      await service.deleteObject("a/b.jpg");

      expect(sendSpy).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });
  });

  describe("headObject", () => {
    it("returns metadata when the object exists", async () => {
      sendSpy.mockResolvedValueOnce({ ContentType: "image/jpeg", ContentLength: 1234 } as never);

      const result = await service.headObject("a/b.jpg");

      expect(sendSpy).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
      expect(result).toEqual({ exists: true, contentType: "image/jpeg", sizeBytes: 1234 });
    });

    it("returns exists false when the object is missing", async () => {
      sendSpy.mockRejectedValueOnce(new NotFound({ $metadata: {}, message: "NotFound" }));

      await expect(service.headObject("a/missing.jpg")).resolves.toEqual({ exists: false });
    });

    it("wraps other client errors in InternalServerErrorException", async () => {
      sendSpy.mockRejectedValueOnce(new Error("boom"));

      await expect(service.headObject("a/b.jpg")).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe("listObjects", () => {
    const lastModified = new Date("2026-08-01T00:00:00.000Z");

    it("lists one page under the prefix and maps the entries", async () => {
      sendSpy.mockResolvedValueOnce({
        Contents: [
          { Key: "photos/a", Size: 10, LastModified: lastModified },
          { Key: "photos/b", Size: 20, LastModified: lastModified },
        ],
        IsTruncated: false,
      } as never);

      const result = await service.listObjects("photos/");

      expect(sendSpy).toHaveBeenCalledWith(expect.any(ListObjectsV2Command));
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Bucket: bucket, Prefix: "photos/", ContinuationToken: undefined } }),
      );
      expect(result).toEqual({
        objects: [
          { key: "photos/a", sizeBytes: 10, lastModified },
          { key: "photos/b", sizeBytes: 20, lastModified },
        ],
        nextContinuationToken: undefined,
      });
    });

    it("passes the continuation token through and returns the next one while truncated", async () => {
      sendSpy.mockResolvedValueOnce({
        Contents: [{ Key: "photos/c", Size: 1, LastModified: lastModified }],
        IsTruncated: true,
        NextContinuationToken: "token-2",
      } as never);

      const result = await service.listObjects("photos/", "token-1");

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Bucket: bucket, Prefix: "photos/", ContinuationToken: "token-1" } }),
      );
      expect(result.nextContinuationToken).toBe("token-2");
    });

    it("returns an empty page when the prefix has no objects", async () => {
      sendSpy.mockResolvedValueOnce({ IsTruncated: false } as never);

      await expect(service.listObjects("photos/")).resolves.toEqual({ objects: [], nextContinuationToken: undefined });
    });

    it("drops entries without a key", async () => {
      sendSpy.mockResolvedValueOnce({ Contents: [{ Size: 1 }, { Key: "photos/d" }] } as never);

      const result = await service.listObjects("photos/");

      expect(result.objects).toEqual([{ key: "photos/d", sizeBytes: undefined, lastModified: undefined }]);
    });

    it("wraps client errors in InternalServerErrorException", async () => {
      sendSpy.mockRejectedValue(new Error("boom"));

      await expect(service.listObjects("photos/")).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(service.listObjects("photos/")).rejects.toThrow(S3_SERVICE_ERRORS.LIST_FAILED("photos/"));
    });
  });

  describe("presigned URLs", () => {
    it("generates a presigned PUT URL", async () => {
      getSignedUrlMock.mockResolvedValue("https://signed-put");

      const url = await service.getPresignedUploadUrl({
        key: "a/b.jpg",
        contentType: "image/jpeg",
        expiresInSeconds: 60,
      });

      expect(url).toBe("https://signed-put");
      expect(getSignedUrlMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(PutObjectCommand),
        expect.objectContaining({ expiresIn: 60 }),
      );
    });

    it("generates a presigned GET URL", async () => {
      getSignedUrlMock.mockResolvedValue("https://signed-get");

      const url = await service.getPresignedDownloadUrl({ key: "a/b.jpg" });

      expect(url).toBe("https://signed-get");
      expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    });

    it("wraps presigner errors in InternalServerErrorException", async () => {
      getSignedUrlMock.mockRejectedValue(new Error("nope"));

      await expect(service.getPresignedUploadUrl({ key: "a/b.jpg" })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
