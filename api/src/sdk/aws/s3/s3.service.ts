import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, InternalServerErrorException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { DEFAULT_PRESIGNED_URL_TTL_SECONDS, S3_SERVICE_ERRORS } from "./s3.constants";

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}

export interface PresignedUploadInput {
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
}

export interface PresignedDownloadInput {
  key: string;
  expiresInSeconds?: number;
}

@Injectable()
export class S3Service implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);

    const region = configService.getOrThrow<string>("aws.region");
    const bucket = configService.get<string>("aws.s3Bucket");
    if (!bucket) throw new Error(S3_SERVICE_ERRORS.BUCKET_NOT_CONFIGURED());
    this.bucket = bucket;

    const accessKeyId = configService.get<string>("aws.accessKeyId");
    const secretAccessKey = configService.get<string>("aws.secretAccessKey");
    if (!accessKeyId || !secretAccessKey) throw new Error(S3_SERVICE_ERRORS.CREDENTIALS_NOT_CONFIGURED());

    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  getBucket(): string {
    return this.bucket;
  }

  async putObject({ key, body, contentType }: PutObjectInput): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 putObject failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.PUT_FAILED(key));
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 deleteObject failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.DELETE_FAILED(key));
    }
  }

  async getPresignedUploadUrl({
    key,
    contentType,
    expiresInSeconds = DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  }: PresignedUploadInput): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 getPresignedUploadUrl failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.PRESIGN_FAILED(key));
    }
  }

  async getPresignedDownloadUrl({
    key,
    expiresInSeconds = DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  }: PresignedDownloadInput): Promise<string> {
    try {
      return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      this.logger.error({ err: error as Error, key }, "s3 getPresignedDownloadUrl failed");
      throw new InternalServerErrorException(S3_SERVICE_ERRORS.PRESIGN_FAILED(key));
    }
  }
}
