import { DetectModerationLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** One label Rekognition's image moderation found, with its place in the taxonomy. */
export interface ModerationLabel {
  name: string;
  /** The label's parent in the taxonomy; empty for a top-level category. */
  parentName: string;
  /** Percent, 0 to 100. */
  confidence: number;
}

/**
 * Amazon Rekognition image moderation, for upload screening
 * (docs/moderation.md §11). It is given the image's bytes, never a bucket and
 * key, so Rekognition needs no S3 or KMS access of its own. The API's
 * identity needs `rekognition:DetectModerationLabels` (infra/upload-screening.tf
 * for the dev IAM user, the Copilot addon for a task role).
 *
 * Credentials as S3Service: the static key when one is set, otherwise the
 * SDK's default chain. The client is created lazily, so nothing is built
 * while screening is off.
 */
@Injectable()
export class RekognitionService implements OnModuleDestroy {
  private client: RekognitionClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleDestroy(): void {
    this.client?.destroy();
  }

  /**
   * The moderation labels at or above `minConfidence` percent in a JPEG or PNG
   * of at most 5 MB. Throws what the SDK throws, including when `abortSignal`
   * fires; callers decide what a failure means.
   */
  async detectModerationLabels(
    bytes: Uint8Array,
    minConfidence: number,
    abortSignal?: AbortSignal,
  ): Promise<ModerationLabel[]> {
    const response = await this.getClient().send(
      new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: minConfidence }),
      { abortSignal },
    );
    return (response.ModerationLabels ?? []).map((label) => ({
      name: label.Name ?? "",
      parentName: label.ParentName ?? "",
      confidence: label.Confidence ?? 0,
    }));
  }

  private getClient(): RekognitionClient {
    if (this.client) return this.client;

    const accessKeyId = this.configService.get<string>("aws.accessKeyId");
    const secretAccessKey = this.configService.get<string>("aws.secretAccessKey");
    this.client = new RekognitionClient({
      region: this.configService.getOrThrow<string>("aws.region"),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
    return this.client;
  }
}
