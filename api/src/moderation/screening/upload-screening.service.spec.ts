import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { RekognitionService } from "src/sdk/aws/rekognition/rekognition.service";
import { ReportsService } from "../reports.service";
import { classifyModerationLabels, screeningNote } from "./screening.constants";
import { ScreenedPhoto, UploadScreeningService } from "./upload-screening.service";

describe("classifyModerationLabels", () => {
  it("files nudity before violence, whatever order the labels come in", () => {
    const verdict = classifyModerationLabels([
      { name: "Graphic Violence", parentName: "Violence", confidence: 91 },
      { name: "Exposed Female Nipple", parentName: "Explicit", confidence: 88 },
    ]);

    expect(verdict?.reason).toBe("NUDITY_OR_SEXUAL");
  });

  it("matches a label by its parent category", () => {
    expect(
      classifyModerationLabels([{ name: "Blood & Gore", parentName: "Visually Disturbing", confidence: 90 }]),
    ).toMatchObject({ reason: "VIOLENCE" });
  });

  it("files nothing for what is ordinary at a party", () => {
    expect(
      classifyModerationLabels([
        { name: "Alcohol", parentName: "", confidence: 99 },
        { name: "Swimwear or Underwear", parentName: "", confidence: 95 },
      ]),
    ).toBeNull();
  });

  it("writes a note the reviewer can read, within the note's length", () => {
    const note = screeningNote({
      reason: "VIOLENCE",
      labels: [{ name: "Violence", parentName: "", confidence: 93.6 }],
    });

    expect(note).toBe("Upload screening: Violence (94%)");
  });
});

describe("UploadScreeningService", () => {
  const photo: ScreenedPhoto = {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    eventId: "66666666-6666-6666-6666-666666666666",
    s3Key: "photos/u/e/b",
    contentType: "image/jpeg",
    sizeBytes: 1024,
    addedById: "22222222-2222-2222-2222-222222222222",
  };
  let config: Record<string, unknown>;
  let rekognition: { detectModerationLabels: jest.Mock };
  let reports: { fileAutomatedReport: jest.Mock };
  let logger: { setContext: jest.Mock; warn: jest.Mock; info: jest.Mock };
  let service: UploadScreeningService;

  beforeEach(() => {
    config = {
      "moderation.screeningEnabled": true,
      "moderation.screeningMinConfidence": 80,
      "moderation.screeningTimeoutMs": 1000,
    };
    const configService = {
      get: jest.fn((key: string) => config[key]),
      getOrThrow: jest.fn((key: string) => config[key]),
    };
    rekognition = { detectModerationLabels: jest.fn().mockResolvedValue([]) };
    reports = { fileAutomatedReport: jest.fn().mockResolvedValue(null) };
    logger = { setContext: jest.fn(), warn: jest.fn(), info: jest.fn() };
    service = new UploadScreeningService(
      configService as unknown as ConfigService,
      rekognition as unknown as RekognitionService,
      reports as unknown as ReportsService,
      logger as unknown as PinoLogger,
    );
  });

  it("files an automated report for a photo Rekognition flags", async () => {
    rekognition.detectModerationLabels.mockResolvedValue([{ name: "Explicit", parentName: "", confidence: 97 }]);

    await service.screen([photo]);

    expect(rekognition.detectModerationLabels).toHaveBeenCalledWith(photo.s3Key, 80);
    expect(reports.fileAutomatedReport).toHaveBeenCalledWith(
      photo,
      "NUDITY_OR_SEXUAL",
      "Upload screening: Explicit (97%)",
    );
  });

  it("skips a format Rekognition can't read, saying so, without calling it", async () => {
    await service.screen([{ ...photo, contentType: "image/heic" }]);

    expect(rekognition.detectModerationLabels).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.screening.skipped", contentType: "image/heic" }),
      expect.any(String),
    );
  });

  it("files nothing for a clean photo", async () => {
    await service.screen([photo]);

    expect(reports.fileAutomatedReport).not.toHaveBeenCalled();
  });

  it("does nothing while screening is off", async () => {
    config["moderation.screeningEnabled"] = false;

    await service.screen([photo]);

    expect(rekognition.detectModerationLabels).not.toHaveBeenCalled();
  });

  it("fails open: a photo it can't check is published, and the failure logged", async () => {
    rekognition.detectModerationLabels.mockRejectedValue(new Error("throttled"));

    await expect(service.screen([photo])).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.screening.failed", photoId: photo.id }),
      expect.any(String),
    );
  });

  it("gives up on a check that takes too long", async () => {
    config["moderation.screeningTimeoutMs"] = 100;
    rekognition.detectModerationLabels.mockReturnValue(new Promise(() => undefined));

    await expect(service.screen([photo])).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
