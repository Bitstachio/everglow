import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  NoSuchUpload,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
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

  describe("deleteObjects", () => {
    const keys = ["photos/a", "photos/b", "photos/c"];

    it("sends one quiet DeleteObjectsCommand for a small batch and reports every key deleted", async () => {
      sendSpy.mockResolvedValueOnce({} as never);

      const result = await service.deleteObjects(keys);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith(expect.any(DeleteObjectsCommand));
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          },
        }),
      );
      expect(result).toEqual({ deleted: keys, failed: [] });
    });

    it("returns the per-key errors S3 reports and counts the rest as deleted", async () => {
      sendSpy.mockResolvedValueOnce({
        Errors: [{ Key: "photos/b", Code: "AccessDenied", Message: "Access Denied" }, { Code: "NoKey" }],
      } as never);

      const result = await service.deleteObjects(keys);

      expect(result).toEqual({
        deleted: ["photos/a", "photos/c"],
        failed: [{ key: "photos/b", code: "AccessDenied", message: "Access Denied" }],
      });
    });

    it("splits more than 1000 keys across requests", async () => {
      const many = Array.from({ length: 2500 }, (_, index) => `photos/${index}`);
      sendSpy.mockResolvedValue({} as never);

      const result = await service.deleteObjects(many);

      expect(sendSpy).toHaveBeenCalledTimes(3);
      const sizes = sendSpy.mock.calls.map(
        ([command]) => (command as DeleteObjectsCommand).input.Delete?.Objects?.length,
      );
      expect(sizes).toEqual([1000, 1000, 500]);
      expect(result.deleted).toHaveLength(2500);
    });

    it("makes no request for an empty key list", async () => {
      await expect(service.deleteObjects([])).resolves.toEqual({ deleted: [], failed: [] });

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("wraps a failed request in InternalServerErrorException", async () => {
      sendSpy.mockRejectedValue(new Error("boom"));

      await expect(service.deleteObjects(keys)).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(service.deleteObjects(keys)).rejects.toThrow(S3_SERVICE_ERRORS.DELETE_BATCH_FAILED(3));
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

  describe("multipart uploads", () => {
    const ref = { key: "photos/a", uploadId: "upload-1" };
    const noSuchUpload = () => new NoSuchUpload({ $metadata: {}, message: "NoSuchUpload" });
    const s3Error = (name: string) => new S3ServiceException({ name, $fault: "client", $metadata: {} });

    describe("createMultipartUpload", () => {
      it("opens the upload with the object's content type and returns the upload id", async () => {
        sendSpy.mockResolvedValueOnce({ UploadId: "upload-1" } as never);

        await expect(service.createMultipartUpload({ key: "photos/a", contentType: "image/jpeg" })).resolves.toBe(
          "upload-1",
        );

        expect(sendSpy).toHaveBeenCalledWith(expect.any(CreateMultipartUploadCommand));
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({ input: { Bucket: bucket, Key: "photos/a", ContentType: "image/jpeg" } }),
        );
      });

      it("wraps a response without an upload id, and client errors, in InternalServerErrorException", async () => {
        sendSpy.mockResolvedValueOnce({} as never);
        await expect(service.createMultipartUpload({ key: "photos/a", contentType: "image/jpeg" })).rejects.toThrow(
          S3_SERVICE_ERRORS.MULTIPART_CREATE_FAILED("photos/a"),
        );

        sendSpy.mockRejectedValueOnce(new Error("boom"));
        await expect(
          service.createMultipartUpload({ key: "photos/a", contentType: "image/jpeg" }),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
      });
    });

    describe("getPresignedUploadPartUrl", () => {
      it("presigns an UploadPart bound to the part number, upload id, and exact length", async () => {
        getSignedUrlMock.mockResolvedValue("https://signed-part");

        const url = await service.getPresignedUploadPartUrl({
          ...ref,
          partNumber: 2,
          contentLength: 5 * 1024 * 1024,
          expiresInSeconds: 60,
        });

        expect(url).toBe("https://signed-part");
        expect(getSignedUrlMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(UploadPartCommand),
          expect.objectContaining({ expiresIn: 60, signableHeaders: new Set(["content-length"]) }),
        );
        const [, command] = getSignedUrlMock.mock.calls[0];
        expect((command as UploadPartCommand).input).toEqual({
          Bucket: bucket,
          Key: "photos/a",
          UploadId: "upload-1",
          PartNumber: 2,
          ContentLength: 5 * 1024 * 1024,
        });
      });
    });

    describe("listMultipartParts", () => {
      it("maps the parts S3 holds, following the part number marker across pages", async () => {
        sendSpy
          .mockResolvedValueOnce({
            Parts: [{ PartNumber: 1, Size: 10, ETag: '"a"' }],
            IsTruncated: true,
            NextPartNumberMarker: "1",
          } as never)
          .mockResolvedValueOnce({
            Parts: [{ PartNumber: 2, Size: 5, ETag: '"b"' }, { Size: 1 }],
            IsTruncated: false,
          } as never);

        const result = await service.listMultipartParts(ref);

        expect(result).toEqual({
          exists: true,
          parts: [
            { partNumber: 1, sizeBytes: 10, etag: '"a"' },
            { partNumber: 2, sizeBytes: 5, etag: '"b"' },
          ],
        });
        expect(sendSpy).toHaveBeenCalledTimes(2);
        expect(sendSpy).toHaveBeenNthCalledWith(1, expect.any(ListPartsCommand));
        expect(sendSpy).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            input: { Bucket: bucket, Key: "photos/a", UploadId: "upload-1", PartNumberMarker: "1" },
          }),
        );
      });

      it("returns exists false when S3 no longer knows the upload", async () => {
        sendSpy.mockRejectedValueOnce(noSuchUpload());

        await expect(service.listMultipartParts(ref)).resolves.toEqual({ exists: false });
      });

      it("wraps other client errors in InternalServerErrorException", async () => {
        sendSpy.mockRejectedValue(new Error("boom"));

        await expect(service.listMultipartParts(ref)).rejects.toThrow(
          S3_SERVICE_ERRORS.MULTIPART_LIST_FAILED("photos/a"),
        );
      });
    });

    describe("completeMultipartUpload", () => {
      const parts = [
        { partNumber: 1, etag: '"a"' },
        { partNumber: 2, etag: '"b"' },
      ];

      it("assembles the object from the given parts", async () => {
        await expect(service.completeMultipartUpload({ ...ref, parts })).resolves.toEqual({ completed: true });

        expect(sendSpy).toHaveBeenCalledWith(expect.any(CompleteMultipartUploadCommand));
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            input: {
              Bucket: bucket,
              Key: "photos/a",
              UploadId: "upload-1",
              MultipartUpload: {
                Parts: [
                  { PartNumber: 1, ETag: '"a"' },
                  { PartNumber: 2, ETag: '"b"' },
                ],
              },
            },
          }),
        );
      });

      it.each(["NoSuchUpload", "InvalidPart", "InvalidPartOrder", "EntityTooSmall"])(
        "reports %s as a refused completion instead of throwing",
        async (code) => {
          sendSpy.mockRejectedValueOnce(code === "NoSuchUpload" ? noSuchUpload() : s3Error(code));

          await expect(service.completeMultipartUpload({ ...ref, parts })).resolves.toEqual({ completed: false, code });
        },
      );

      it("wraps other errors in InternalServerErrorException", async () => {
        sendSpy.mockRejectedValueOnce(s3Error("InternalError"));

        await expect(service.completeMultipartUpload({ ...ref, parts })).rejects.toThrow(
          S3_SERVICE_ERRORS.MULTIPART_COMPLETE_FAILED("photos/a"),
        );
      });
    });

    describe("abortMultipartUpload", () => {
      it("sends an AbortMultipartUploadCommand", async () => {
        await service.abortMultipartUpload(ref);

        expect(sendSpy).toHaveBeenCalledWith(expect.any(AbortMultipartUploadCommand));
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({ input: { Bucket: bucket, Key: "photos/a", UploadId: "upload-1" } }),
        );
      });

      it("treats an upload S3 no longer knows as already aborted", async () => {
        sendSpy.mockRejectedValueOnce(noSuchUpload());

        await expect(service.abortMultipartUpload(ref)).resolves.toBeUndefined();
      });

      it("wraps other errors in InternalServerErrorException", async () => {
        sendSpy.mockRejectedValueOnce(new Error("boom"));

        await expect(service.abortMultipartUpload(ref)).rejects.toThrow(
          S3_SERVICE_ERRORS.MULTIPART_ABORT_FAILED("photos/a"),
        );
      });
    });
  });

  describe("presigned URLs", () => {
    it("generates a presigned PUT URL bound to the declared type and length", async () => {
      getSignedUrlMock.mockResolvedValue("https://signed-put");

      const url = await service.getPresignedUploadUrl({
        key: "a/b.jpg",
        contentType: "image/jpeg",
        contentLength: 1024,
        expiresInSeconds: 60,
      });

      expect(url).toBe("https://signed-put");
      expect(getSignedUrlMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(PutObjectCommand),
        expect.objectContaining({ expiresIn: 60, signableHeaders: new Set(["content-type", "content-length"]) }),
      );
      const [, command] = getSignedUrlMock.mock.calls[0];
      expect((command as PutObjectCommand).input).toEqual({
        Bucket: bucket,
        Key: "a/b.jpg",
        ContentType: "image/jpeg",
        ContentLength: 1024,
      });
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
