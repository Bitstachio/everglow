import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { buildPhotoS3Key } from "src/photos/photos.constants";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import { TEST_EVENT_ID } from "./helpers/events.fixtures";
import { TEST_REPORT_ID, buildReport } from "./helpers/moderation.fixtures";
import { TEST_PHOTO_ID, withPhotoDerivatives } from "./helpers/photos.fixtures";
import { TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

/**
 * Actioning an intimate-image report removes its identical copies in other
 * events (docs/moderation.md §7). Runs the real EvidenceService, which the
 * other suites replace, so the copies' evidence path is the one in production.
 */
describe("Identical copies of a removed intimate image (integration)", () => {
  const OTHER_EVENT_ID = "eeeeeeee-1111-4222-8333-eeeeeeeeeeee";
  const COPY_PHOTO_ID = "ffffffff-1111-4222-8333-ffffffffffff";
  const COPY_UPLOADER_ID = "abababab-1111-4222-8333-abababababab";
  const LINKED_REPORT_ID = "acacacac-1111-4222-8333-acacacacacac";
  const sha256 = "9f".repeat(32);
  const originalKey = buildPhotoS3Key(TEST_EVENT_ID, TEST_PHOTO_ID);
  const copyKey = buildPhotoS3Key(OTHER_EVENT_ID, COPY_PHOTO_ID);
  const evidenceKey = (reportId: string, key: string) => `evidence/${reportId}/${key}`;

  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;
  const s3Service = {
    copyObject: jest.fn(),
    deleteObject: jest.fn(),
    deleteObjects: jest.fn(),
    sha256OfObject: jest.fn(),
    getPresignedDownloadUrl: jest.fn(),
  };

  const ncii = buildReport({
    reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
    queue: "PLATFORM",
    escalationReasons: ["INTIMATE_IMAGE"],
  });
  const evidenceRow = (reportId: string, objectS3Key: string | null) => ({
    id: `ev-${reportId}`,
    reportId,
    objectS3Key,
    contentType: "image/jpeg",
    sizeBytes: 2048,
    evidenceS3Key: null,
    sha256: null,
    quarantinedAt: null,
    quarantineFailedAt: null,
    subjectUserId: null,
    subjectUsername: null,
    createdAt: new Date(),
  });

  beforeAll(async () => {
    const context = await createTestApp((builder) =>
      builder
        .overrideProvider(S3Service)
        .useValue(s3Service)
        .overrideProvider(EvidenceService)
        .useClass(EvidenceService),
    );
    app = context.app;
    prisma = context.prisma;
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockReset(prisma);
    for (const mock of Object.values(s3Service)) mock.mockReset();
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.user.findUnique.mockResolvedValue({ ...buildUserWithDetails(), platformRole: "MODERATOR" } as never);
    prisma.userDetails.findUnique.mockResolvedValue({ username: "copier" } as never);
    s3Service.copyObject.mockResolvedValue({ sha256 });
    s3Service.deleteObject.mockResolvedValue(undefined);
    s3Service.deleteObjects.mockImplementation((keys: string[]) => Promise.resolve({ deleted: keys, failed: [] }));

    // The report acted on, and the photo it is about.
    prisma.report.findUnique.mockResolvedValue({
      ...ncii,
      evidence: evidenceRow(TEST_REPORT_ID, originalKey),
    } as never);
    prisma.photo.findUnique.mockResolvedValue({ id: TEST_PHOTO_ID, s3Key: originalKey } as never);
    prisma.report.updateManyAndReturn.mockResolvedValueOnce([
      { ...ncii, status: "ACTIONED", closedReason: "PHOTO_REMOVED", closedByRole: "PLATFORM" },
    ]);
    prisma.report.updateManyAndReturn.mockResolvedValue([]);
    prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
    // The removed image's snapshot, hashed by S3 when it was quarantined.
    prisma.report.findMany.mockResolvedValue([
      {
        id: TEST_REPORT_ID,
        resolvedById: TEST_USER_ID,
        holdUntil: null,
        holdReason: null,
        evidence: { id: `ev-${TEST_REPORT_ID}`, sha256, objectS3Key: null },
      },
    ] as never);
    // One identical copy, in another event.
    prisma.photo.findMany.mockResolvedValue([
      {
        id: COPY_PHOTO_ID,
        eventId: OTHER_EVENT_ID,
        s3Key: copyKey,
        contentType: "image/jpeg",
        sizeBytes: 2048,
        addedById: COPY_UPLOADER_ID,
        event: { title: "Another roll" },
      },
    ] as never);
    prisma.report.create.mockResolvedValue({ id: LINKED_REPORT_ID } as never);
    // Evidence lookups: by the key a delete is about to remove, then by report for the discard.
    prisma.reportEvidence.findMany.mockImplementation(((args: { where: Record<string, { in: string[] }> }) => {
      if (args.where.objectS3Key) {
        const keys = args.where.objectS3Key.in;
        if (keys.includes(copyKey)) return Promise.resolve([evidenceRow(LINKED_REPORT_ID, copyKey)]);
        return Promise.resolve([evidenceRow(TEST_REPORT_ID, originalKey)]);
      }
      return Promise.resolve(
        args.where.reportId.in.map((reportId) => ({
          id: `ev-${reportId}`,
          reportId,
          evidenceS3Key: evidenceKey(reportId, reportId === LINKED_REPORT_ID ? copyKey : originalKey),
        })),
      );
    }) as never);
  });

  it("removes every identical copy in other events, each with its own evidence, when the image is removed", async () => {
    await request(httpServer)
      .patch(`/${API_GLOBAL_PREFIX}/admin/reports/${TEST_REPORT_ID}`)
      .set(authHeader())
      .send({ action: "REMOVE_PHOTO" })
      .expect(200);

    // Copies are looked up by the removed image's hash, across every event.
    expect(prisma.photo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sha256, status: "READY" } }));
    // The copy gets a linked report, actioned by the same moderator, with a snapshot of the copy.
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: OTHER_EVENT_ID,
        eventTitle: "Another roll",
        photoId: COPY_PHOTO_ID,
        reportedUserId: COPY_UPLOADER_ID,
        reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
        status: "ACTIONED",
        closedReason: "PHOTO_REMOVED",
        closedByRole: "PLATFORM",
        resolvedById: TEST_USER_ID,
      }) as unknown,
      select: { id: true },
    });
    expect(prisma.reportEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reportId: LINKED_REPORT_ID, objectS3Key: copyKey }) as unknown,
    });
    expect(prisma.reportEvidence.update).toHaveBeenCalledWith({
      where: { reportId: LINKED_REPORT_ID },
      data: { sha256 },
    });
    // The copy's row goes at once, so it is gone from every list, count and thumbnail.
    expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [COPY_PHOTO_ID] } } });
    // Its object is copied to evidence under the linked report before it is deleted, renditions included.
    expect(s3Service.copyObject).toHaveBeenCalledWith(copyKey, evidenceKey(LINKED_REPORT_ID, copyKey));
    expect(s3Service.deleteObjects).toHaveBeenCalledWith(withPhotoDerivatives(copyKey));
    const copyQuarantine = s3Service.copyObject.mock.calls.findIndex(([source]) => source === copyKey);
    const copyDelete = s3Service.deleteObjects.mock.calls.findIndex(([keys]) => (keys as string[])[0] === copyKey);
    expect(s3Service.copyObject.mock.invocationCallOrder[copyQuarantine]).toBeLessThan(
      s3Service.deleteObjects.mock.invocationCallOrder[copyDelete],
    );
    // As with the original, an intimate image's evidence copy is then deleted; only its hash stays.
    expect(prisma.reportEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reportId: { in: [TEST_REPORT_ID, LINKED_REPORT_ID] } }) as unknown,
      }),
    );
    expect(s3Service.deleteObject).toHaveBeenCalledWith(evidenceKey(TEST_REPORT_ID, originalKey));
    expect(s3Service.deleteObject).toHaveBeenCalledWith(evidenceKey(LINKED_REPORT_ID, copyKey));
    expect(prisma.reportEvidence.update).toHaveBeenCalledWith({
      where: { id: `ev-${LINKED_REPORT_ID}` },
      data: { evidenceS3Key: null, objectS3Key: null, quarantineFailedAt: null },
    });
  });

  it("removes no copies when the report is dismissed", async () => {
    prisma.report.updateManyAndReturn.mockReset();
    prisma.report.updateManyAndReturn.mockResolvedValueOnce([{ ...ncii, status: "DISMISSED" }]).mockResolvedValue([]);

    await request(httpServer)
      .patch(`/${API_GLOBAL_PREFIX}/admin/reports/${TEST_REPORT_ID}`)
      .set(authHeader())
      .send({ action: "DISMISS" })
      .expect(200);

    expect(prisma.photo.findMany).not.toHaveBeenCalled();
    expect(prisma.report.create).not.toHaveBeenCalled();
  });
});
