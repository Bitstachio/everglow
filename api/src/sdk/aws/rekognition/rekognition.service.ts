import { DetectModerationLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** One label Rekognition's moderation model found, with the category it belongs to. */
export interface ModerationLabel {
  name: string;
  /** The label's parent in Rekognition's taxonomy; empty for a top-level category. */
  parentName: string;
  confidence: number;
}

/**
 * Amazon Rekognition's image moderation, reading the object straight from the
 * bucket with the API's own credentials (docs/moderation.md §11).
 */
@Injectable()
export class RekognitionService implements OnModuleDestroy {
  private readonly client: RekognitionClient;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    this.bucket = configService.getOrThrow<string>("aws.s3Bucket");
    const accessKeyId = configService.get<string>("aws.accessKeyId");
    const secretAccessKey = configService.get<string>("aws.secretAccessKey");
    this.client = new RekognitionClient({
      region: configService.getOrThrow<string>("aws.region"),
      ...(accessKeyId && secretAccessKey && { credentials: { accessKeyId, secretAccessKey } }),
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  /** The moderation labels Rekognition finds in the object at `key`, at `minConfidence` percent or more. */
  async detectModerationLabels(key: string, minConfidence: number): Promise<ModerationLabel[]> {
    const response = await this.client.send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: this.bucket, Name: key } },
        MinConfidence: minConfidence,
      }),
    );
    return (response.ModerationLabels ?? []).map((label) => ({
      name: label.Name ?? "",
      parentName: label.ParentName ?? "",
      confidence: label.Confidence ?? 0,
    }));
  }
}
