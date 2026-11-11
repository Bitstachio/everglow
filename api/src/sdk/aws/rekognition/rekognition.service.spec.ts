import { DetectModerationLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { ConfigService } from "@nestjs/config";
import { RekognitionService } from "./rekognition.service";

describe("RekognitionService", () => {
  let sendSpy: jest.SpyInstance;
  let service: RekognitionService;

  const configFor = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key], getOrThrow: (key: string) => values[key] }) as unknown as ConfigService;

  beforeEach(() => {
    sendSpy = jest.spyOn(RekognitionClient.prototype, "send");
    service = new RekognitionService(configFor({ "aws.region": "us-east-1" }));
  });

  afterEach(() => {
    service.onModuleDestroy();
    sendSpy.mockRestore();
  });

  it("sends the bytes with the confidence floor, never a bucket key, and maps the labels", async () => {
    sendSpy.mockResolvedValue({
      ModerationLabels: [
        { Name: "Explicit Nudity", ParentName: "Explicit", Confidence: 97.2, TaxonomyLevel: 2 },
        { Name: "Explicit", ParentName: "", Confidence: 97.2, TaxonomyLevel: 1 },
      ],
    } as never);
    const bytes = new Uint8Array([0xff, 0xd8]);
    const signal = new AbortController().signal;

    await expect(service.detectModerationLabels(bytes, 80, signal)).resolves.toEqual([
      { name: "Explicit Nudity", parentName: "Explicit", confidence: 97.2 },
      { name: "Explicit", parentName: "", confidence: 97.2 },
    ]);
    const [command, options] = sendSpy.mock.calls[0] as [DetectModerationLabelsCommand, { abortSignal: AbortSignal }];
    expect(command).toBeInstanceOf(DetectModerationLabelsCommand);
    expect(command.input).toEqual({ Image: { Bytes: bytes }, MinConfidence: 80 });
    expect(options.abortSignal).toBe(signal);
  });

  it("answers an empty list when nothing is found", async () => {
    sendSpy.mockResolvedValue({} as never);

    await expect(service.detectModerationLabels(new Uint8Array([1]), 80)).resolves.toEqual([]);
  });

  it("lets the SDK's errors through for the caller to judge", async () => {
    sendSpy.mockRejectedValue(Object.assign(new Error("slow down"), { name: "ThrottlingException" }));

    await expect(service.detectModerationLabels(new Uint8Array([1]), 80)).rejects.toMatchObject({
      name: "ThrottlingException",
    });
  });
});
