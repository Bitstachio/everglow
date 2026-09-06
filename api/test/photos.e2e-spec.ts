import { INestApplication, InternalServerErrorException } from "@nestjs/common";
import { Prisma, PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import {
  PHOTO_SERVICE_ERRORS,
  FREE_TIER_STORAGE_LIMIT_BYTES,
  STORAGE_RESERVATION_MAX_ATTEMPTS,
} from "src/photos/photos.constants";
import { encodePhotoCursor } from "src/photos/photos.cursor";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { TEST_OTHER_ACCESS_TOKEN, TEST_OTHER_USER_ID, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_EVENT_ID,
  buildEvent,
  buildOrganizerAccess,
  buildParticipantAccess,
  buildViewerAccess,
} from "./helpers/events.fixtures";
import {
  TEST_MULTIPART_PART_SIZE_BYTES,
  TEST_MULTIPART_SIZE_BYTES,
  TEST_MULTIPART_UPLOAD_ID,
  TEST_OTHER_PHOTO_ID,
  TEST_PHOTO_ID,
  TEST_SIGNED_GET_URL,
  TEST_SIGNED_PUT_URL,
  buildMultipartPhoto,
  buildPhoto,
  expectedPhotoResponse,
} from "./helpers/photos.fixtures";
import { TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

const uploadUrlsPath = (eventId = TEST_EVENT_ID) => `/${API_GLOBAL_PREFIX}/events/${eventId}/photos/upload-urls`;
const confirmPath = (eventId = TEST_EVENT_ID) => `/${API_GLOBAL_PREFIX}/events/${eventId}/photos/confirm`;
const photosListPath = (eventId = TEST_EVENT_ID) => `/${API_GLOBAL_PREFIX}/events/${eventId}/photos`;
const photoPath = (photoId = TEST_PHOTO_ID) => `/${API_GLOBAL_PREFIX}/photos/${photoId}`;
const multipartUploadsPath = (eventId = TEST_EVENT_ID) =>
  `/${API_GLOBAL_PREFIX}/events/${eventId}/photos/multipart-uploads`;
const multipartPath = (photoId = TEST_PHOTO_ID) => `/${API_GLOBAL_PREFIX}/photos/${photoId}/multipart-upload`;
const multipartCompletePath = (photoId = TEST_PHOTO_ID) => `${multipartPath(photoId)}/complete`;

const ONE_GIB = 1024n ** 3n;
const TEN_GIB = 10n * ONE_GIB;

type WrappedResponse<T> = {
  data: T;
  meta: { timestamp: string; path: string };
};

type ErrorResponse = {
  message?: string;
  meta: { timestamp: string; path: string };
};

type UploadSlotBody = { photoId: string; uploadUrl: string };
type ConfirmResultBody = { photoId: string; status: string };
type PhotoBody = {
  id: string;
  eventId: string;
  addedById: string;
  url: string;
  contentType: string;
  createdAt: string;
};
type PhotoListBody = { items: PhotoBody[]; nextCursor: string | null };
type MultipartPartBody = { partNumber: number; sizeBytes: number; uploadUrl: string; uploaded: boolean };
type MultipartUploadBody = {
  photoId: string;
  sizeBytes: number;
  partSizeBytes: number;
  expiresAt: string;
  parts: MultipartPartBody[];
};

describe("PhotosController (e2e)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;

  const s3Service = {
    getBucket: jest.fn(),
    putObject: jest.fn(),
    deleteObject: jest.fn(),
    headObject: jest.fn(),
    getPresignedUploadUrl: jest.fn(),
    getPresignedDownloadUrl: jest.fn(),
    createMultipartUpload: jest.fn(),
    getPresignedUploadPartUrl: jest.fn(),
    listMultipartParts: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
  };

  const eventWithAccess = (access: ReturnType<typeof buildOrganizerAccess>[]) => ({
    ...buildEvent(),
    eventAccesses: access,
  });

  const photoWithAccess = (
    access: ReturnType<typeof buildOrganizerAccess>[],
    overrides: Parameters<typeof buildPhoto>[0] = {},
  ) => ({
    ...buildPhoto(overrides),
    event: eventWithAccess(access),
  });

  beforeAll(async () => {
    const context = await createTestApp((builder) => builder.overrideProvider(S3Service).useValue(s3Service));
    app = context.app;
    prisma = context.prisma;
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockReset(prisma);
    prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } } as never);
    // Interactive transactions run their callback against the same mock client.
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));

    for (const mock of Object.values(s3Service)) mock.mockReset();
    s3Service.getPresignedUploadUrl.mockResolvedValue(TEST_SIGNED_PUT_URL);
    s3Service.getPresignedDownloadUrl.mockResolvedValue(TEST_SIGNED_GET_URL);
    s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 });
    s3Service.deleteObject.mockResolvedValue(undefined);
    s3Service.createMultipartUpload.mockResolvedValue(TEST_MULTIPART_UPLOAD_ID);
    s3Service.getPresignedUploadPartUrl.mockImplementation(({ partNumber }: { partNumber: number }) =>
      Promise.resolve(`${TEST_SIGNED_PUT_URL}?partNumber=${partNumber}`),
    );
    s3Service.listMultipartParts.mockResolvedValue({ exists: true, parts: [] });
    s3Service.completeMultipartUpload.mockResolvedValue({ completed: true });
    s3Service.abortMultipartUpload.mockResolvedValue(undefined);
  });

  describe("POST /events/:eventId/photos/upload-urls", () => {
    const payload = { files: [{ contentType: "image/jpeg", sizeBytes: 1024 }] };

    it("returns 201 with presigned upload slots for an organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]) as never);
      prisma.photo.createMany.mockResolvedValue({ count: 1 });

      const response = await request(httpServer).post(uploadUrlsPath()).set(authHeader()).send(payload).expect(201);

      const body = response.body as WrappedResponse<UploadSlotBody[]>;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].uploadUrl).toBe(TEST_SIGNED_PUT_URL);
      expect(body.data[0].photoId).toMatch(/^[0-9a-f-]{36}$/);
      // Quota check + insert are reserved atomically under Serializable isolation.
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(prisma.photo.createMany).toHaveBeenCalledTimes(1);
      // The URL is bound to the declared shape, so S3 refuses any other body.
      expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: "image/jpeg", contentLength: 1024 }),
      );
    });

    it("returns 500 and releases the reserved rows when presigning fails", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]) as never);
      prisma.photo.createMany.mockResolvedValue({ count: 1 });
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      s3Service.getPresignedUploadUrl.mockRejectedValue(new InternalServerErrorException("presign failed"));

      await request(httpServer).post(uploadUrlsPath()).set(authHeader()).send(payload).expect(500);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [expect.stringMatching(/^[0-9a-f-]{36}$/) as string] }, status: "PENDING" },
      });
    });

    it("mints slots against the caller's own limit when usage is already above the free tier", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]) as never);
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails({ storageLimitBytes: TEN_GIB }));
      prisma.photo.aggregate.mockResolvedValue({
        _sum: { sizeBytes: Number(FREE_TIER_STORAGE_LIMIT_BYTES + 1024n) },
      } as never);
      prisma.photo.createMany.mockResolvedValue({ count: 1 });

      await request(httpServer).post(uploadUrlsPath()).set(authHeader()).send(payload).expect(201);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
        select: { storageLimitBytes: true },
      });
      expect(prisma.photo.createMany).toHaveBeenCalledTimes(1);
    });

    it("returns 400 for a disallowed contentType", async () => {
      await request(httpServer)
        .post(uploadUrlsPath())
        .set(authHeader())
        .send({ files: [{ contentType: "application/pdf", sizeBytes: 1024 }] })
        .expect(400);
    });

    it("returns 400 for an oversized file", async () => {
      await request(httpServer)
        .post(uploadUrlsPath())
        .set(authHeader())
        .send({ files: [{ contentType: "image/jpeg", sizeBytes: 26 * 1024 * 1024 }] })
        .expect(400);
    });

    it("returns 400 for an empty file list", async () => {
      await request(httpServer).post(uploadUrlsPath()).set(authHeader()).send({ files: [] }).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).post(uploadUrlsPath()).send(payload).expect(401);
    });

    it("returns 403 when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildViewerAccess()]) as never);

      const response = await request(httpServer).post(uploadUrlsPath()).set(authHeader()).send(payload).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.CREATE_FORBIDDEN(TEST_EVENT_ID));
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).post(uploadUrlsPath()).set(authHeader()).send(payload).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_FOUND(TEST_EVENT_ID));
    });

    it("returns 413 when the upload would exceed the caller's own storage limit", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]) as never);
      // A limit below the free tier proves the ceiling comes from the user row, not the constant.
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails({ storageLimitBytes: ONE_GIB }));
      prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: Number(ONE_GIB - 512n) } } as never);

      const response = await request(httpServer)
        .post(uploadUrlsPath())
        .set(authHeader())
        .send({ files: [{ contentType: "image/jpeg", sizeBytes: 1024 }] })
        .expect(413);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.STORAGE_QUOTA_EXCEEDED);
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it("returns 409 when the quota reservation keeps losing serialization conflicts", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]) as never);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock.", {
          code: "P2034",
          clientVersion: "7.8.0",
        }),
      );

      const response = await request(httpServer).post(uploadUrlsPath()).set(authHeader()).send(payload).expect(409);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.STORAGE_RESERVATION_CONFLICT);
      expect(prisma.$transaction).toHaveBeenCalledTimes(STORAGE_RESERVATION_MAX_ATTEMPTS);
      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe("POST /events/:eventId/photos/confirm", () => {
    it("returns 201 with per-photo verification results", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto({ status: "PENDING" })]);
      prisma.photo.updateMany.mockResolvedValue({ count: 1 });

      const response = await request(httpServer)
        .post(confirmPath())
        .set(authHeader())
        .send({ photoIds: [TEST_PHOTO_ID, TEST_OTHER_PHOTO_ID] })
        .expect(201);

      const body = response.body as WrappedResponse<ConfirmResultBody[]>;
      expect(body.data).toEqual([
        { photoId: TEST_PHOTO_ID, status: "READY" },
        { photoId: TEST_OTHER_PHOTO_ID, status: "NOT_FOUND" },
      ]);
      expect(prisma.photo.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [TEST_PHOTO_ID] } },
        data: { status: "READY", multipartUploadId: null, multipartPartSizeBytes: null },
      });
      // Only the caller's own slots are considered; an unknown id is not released.
      expect(prisma.photo.findMany).toHaveBeenCalledWith({
        where: { id: { in: [TEST_PHOTO_ID, TEST_OTHER_PHOTO_ID] }, eventId: TEST_EVENT_ID, addedById: TEST_USER_ID },
      });
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
    });

    it("returns 201 with MISSING and releases the slot when nothing was uploaded", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto({ status: "PENDING" })]);
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      s3Service.headObject.mockResolvedValue({ exists: false });

      const response = await request(httpServer)
        .post(confirmPath())
        .set(authHeader())
        .send({ photoIds: [TEST_PHOTO_ID] })
        .expect(201);

      const body = response.body as WrappedResponse<ConfirmResultBody[]>;
      expect(body.data).toEqual([{ photoId: TEST_PHOTO_ID, status: "MISSING" }]);
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [TEST_PHOTO_ID] }, status: "PENDING" },
      });
    });

    it("returns 201 with MISMATCHED and removes the object and the slot when the upload differs", async () => {
      const photo = buildPhoto({ status: "PENDING" });
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]) as never);
      prisma.photo.findMany.mockResolvedValue([photo]);
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: 999 });

      const response = await request(httpServer)
        .post(confirmPath())
        .set(authHeader())
        .send({ photoIds: [TEST_PHOTO_ID] })
        .expect(201);

      const body = response.body as WrappedResponse<ConfirmResultBody[]>;
      expect(body.data).toEqual([{ photoId: TEST_PHOTO_ID, status: "MISMATCHED" }]);
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).toHaveBeenCalledWith(photo.s3Key);
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [TEST_PHOTO_ID] }, status: "PENDING" },
      });
    });

    it("returns 400 when photoIds contains a non-UUID value", async () => {
      await request(httpServer)
        .post(confirmPath())
        .set(authHeader())
        .send({ photoIds: ["not-a-uuid"] })
        .expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer)
        .post(confirmPath())
        .send({ photoIds: [TEST_PHOTO_ID] })
        .expect(401);
    });

    it("returns 403 when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildViewerAccess()]) as never);

      const response = await request(httpServer)
        .post(confirmPath())
        .set(authHeader())
        .send({ photoIds: [TEST_PHOTO_ID] })
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.CONFIRM_FORBIDDEN(TEST_EVENT_ID));
    });
  });

  describe("POST /events/:eventId/photos/multipart-uploads", () => {
    const payload = { contentType: "image/jpeg", sizeBytes: TEST_MULTIPART_SIZE_BYTES };
    const MIB = 1024 * 1024;

    it("returns 201 with the part layout and a presigned URL per part for a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]) as never);
      prisma.photo.createMany.mockResolvedValue({ count: 1 });
      prisma.photo.update.mockResolvedValue(buildMultipartPhoto());

      const response = await request(httpServer)
        .post(multipartUploadsPath())
        .set(authHeader())
        .send(payload)
        .expect(201);

      const body = response.body as WrappedResponse<MultipartUploadBody>;
      expect(body.data.photoId).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.data.sizeBytes).toBe(TEST_MULTIPART_SIZE_BYTES);
      expect(body.data.partSizeBytes).toBe(TEST_MULTIPART_PART_SIZE_BYTES);
      expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(body.data.parts).toEqual([
        { partNumber: 1, sizeBytes: 5 * MIB, uploadUrl: `${TEST_SIGNED_PUT_URL}?partNumber=1`, uploaded: false },
        { partNumber: 2, sizeBytes: 5 * MIB, uploadUrl: `${TEST_SIGNED_PUT_URL}?partNumber=2`, uploaded: false },
        { partNumber: 3, sizeBytes: 2 * MIB, uploadUrl: `${TEST_SIGNED_PUT_URL}?partNumber=3`, uploaded: false },
      ]);
      // Same quota reservation as a single-PUT slot, then the upload id lands on the row.
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(prisma.photo.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ id: body.data.photoId, sizeBytes: TEST_MULTIPART_SIZE_BYTES, status: "PENDING" }),
        ],
      });
      expect(s3Service.createMultipartUpload).toHaveBeenCalledWith({
        key: expect.stringContaining(body.data.photoId) as string,
        contentType: "image/jpeg",
      });
      expect(prisma.photo.update).toHaveBeenCalledWith({
        where: { id: body.data.photoId },
        data: { multipartUploadId: TEST_MULTIPART_UPLOAD_ID },
      });
    });

    it("returns 400 for a file smaller than one part", async () => {
      await request(httpServer)
        .post(multipartUploadsPath())
        .set(authHeader())
        .send({ contentType: "image/jpeg", sizeBytes: 5 * MIB - 1 })
        .expect(400);
    });

    it("returns 400 for a disallowed contentType", async () => {
      await request(httpServer)
        .post(multipartUploadsPath())
        .set(authHeader())
        .send({ contentType: "application/pdf", sizeBytes: TEST_MULTIPART_SIZE_BYTES })
        .expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).post(multipartUploadsPath()).send(payload).expect(401);
    });

    it("returns 403 when the caller is a viewer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildViewerAccess()]) as never);

      const response = await request(httpServer)
        .post(multipartUploadsPath())
        .set(authHeader())
        .send(payload)
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.CREATE_FORBIDDEN(TEST_EVENT_ID));
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await request(httpServer).post(multipartUploadsPath()).set(authHeader()).send(payload).expect(404);
    });

    it("returns 500 and releases the slot when S3 cannot open the upload", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]) as never);
      prisma.photo.createMany.mockResolvedValue({ count: 1 });
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      s3Service.createMultipartUpload.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await request(httpServer).post(multipartUploadsPath()).set(authHeader()).send(payload).expect(500);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [expect.stringMatching(/^[0-9a-f-]{36}$/) as string] }, status: "PENDING" },
      });
      expect(s3Service.abortMultipartUpload).not.toHaveBeenCalled();
    });
  });

  describe("GET /photos/:photoId/multipart-upload", () => {
    const MIB = 1024 * 1024;

    it("returns 200 with fresh URLs and which parts S3 already holds", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], buildMultipartPhoto()) as never,
      );
      s3Service.listMultipartParts.mockResolvedValue({
        exists: true,
        parts: [
          { partNumber: 1, sizeBytes: 5 * MIB, etag: '"a"' },
          { partNumber: 2, sizeBytes: 1 * MIB, etag: '"partial"' },
        ],
      });

      const response = await request(httpServer).get(multipartPath()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<MultipartUploadBody>;
      expect(body.data.photoId).toBe(TEST_PHOTO_ID);
      expect(body.data.parts.map((part) => [part.partNumber, part.uploaded])).toEqual([
        [1, true],
        [2, false],
        [3, false],
      ]);
      expect(s3Service.listMultipartParts).toHaveBeenCalledWith({
        key: buildMultipartPhoto().s3Key,
        uploadId: TEST_MULTIPART_UPLOAD_ID,
      });
    });

    it("returns 404 for another uploader's upload", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildOrganizerAccess()], buildMultipartPhoto({ addedById: TEST_OTHER_USER_ID })) as never,
      );

      await request(httpServer).get(multipartPath()).set(authHeader()).expect(404);
    });

    it("returns 404 for a single-PUT slot", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], buildPhoto({ status: "PENDING" })) as never,
      );

      const response = await request(httpServer).get(multipartPath()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.MULTIPART_NOT_FOUND(TEST_PHOTO_ID));
    });

    it("returns 403 when the uploader has lost event access", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([], buildMultipartPhoto()) as never);

      await request(httpServer).get(multipartPath()).set(authHeader()).expect(403);
    });

    it("returns 410 and releases the slot when S3 no longer knows the upload", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], buildMultipartPhoto()) as never,
      );
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      s3Service.listMultipartParts.mockResolvedValue({ exists: false });

      const response = await request(httpServer).get(multipartPath()).set(authHeader()).expect(410);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.MULTIPART_EXPIRED(TEST_PHOTO_ID));
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [TEST_PHOTO_ID] }, status: "PENDING" },
      });
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(multipartPath()).expect(401);
    });
  });

  describe("POST /photos/:photoId/multipart-upload/complete", () => {
    const MIB = 1024 * 1024;
    const allParts = {
      exists: true,
      parts: [
        { partNumber: 1, sizeBytes: 5 * MIB, etag: '"a"' },
        { partNumber: 2, sizeBytes: 5 * MIB, etag: '"b"' },
        { partNumber: 3, sizeBytes: 2 * MIB, etag: '"c"' },
      ],
    };

    it("returns 201 READY after assembling the parts and verifying the object", async () => {
      const photo = buildMultipartPhoto();
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()], photo) as never);
      prisma.photo.updateMany.mockResolvedValue({ count: 1 });
      s3Service.listMultipartParts.mockResolvedValue(allParts);
      s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: photo.sizeBytes });

      const response = await request(httpServer).post(multipartCompletePath()).set(authHeader()).expect(201);

      const body = response.body as WrappedResponse<ConfirmResultBody>;
      expect(body.data).toEqual({ photoId: TEST_PHOTO_ID, status: "READY" });
      expect(s3Service.completeMultipartUpload).toHaveBeenCalledWith({
        key: photo.s3Key,
        uploadId: TEST_MULTIPART_UPLOAD_ID,
        parts: [
          { partNumber: 1, etag: '"a"' },
          { partNumber: 2, etag: '"b"' },
          { partNumber: 3, etag: '"c"' },
        ],
      });
      expect(prisma.photo.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [TEST_PHOTO_ID] } },
        data: { status: "READY", multipartUploadId: null, multipartPartSizeBytes: null },
      });
    });

    it("returns 201 READY again for an already completed photo without calling S3", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], buildPhoto({ status: "READY" })) as never,
      );

      const response = await request(httpServer).post(multipartCompletePath()).set(authHeader()).expect(201);

      const body = response.body as WrappedResponse<ConfirmResultBody>;
      expect(body.data).toEqual({ photoId: TEST_PHOTO_ID, status: "READY" });
      expect(s3Service.listMultipartParts).not.toHaveBeenCalled();
      expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it("returns 400 naming the parts that are still missing", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], buildMultipartPhoto()) as never,
      );
      s3Service.listMultipartParts.mockResolvedValue({
        exists: true,
        parts: [{ partNumber: 1, sizeBytes: 5 * MIB, etag: '"a"' }],
      });

      const response = await request(httpServer).post(multipartCompletePath()).set(authHeader()).expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.MULTIPART_INCOMPLETE([2, 3]));
      expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
    });

    it("returns 400 and keeps the upload open when S3 refuses the assembly", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], buildMultipartPhoto()) as never,
      );
      s3Service.listMultipartParts.mockResolvedValue(allParts);
      s3Service.completeMultipartUpload.mockResolvedValue({ completed: false, code: "InvalidPart" });

      const response = await request(httpServer).post(multipartCompletePath()).set(authHeader()).expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.MULTIPART_COMPLETE_REJECTED("InvalidPart"));
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
    });

    it("returns 410 and releases the slot when S3 lost the upload", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], buildMultipartPhoto()) as never,
      );
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      s3Service.listMultipartParts.mockResolvedValue(allParts);
      s3Service.completeMultipartUpload.mockResolvedValue({ completed: false, code: "NoSuchUpload" });

      await request(httpServer).post(multipartCompletePath()).set(authHeader()).expect(410);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [TEST_PHOTO_ID] }, status: "PENDING" },
      });
    });

    it("returns 404 for another uploader's upload", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildOrganizerAccess()], buildMultipartPhoto({ addedById: TEST_OTHER_USER_ID })) as never,
      );

      await request(httpServer).post(multipartCompletePath()).set(authHeader()).expect(404);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).post(multipartCompletePath()).expect(401);
    });
  });

  describe("GET /events/:eventId/photos", () => {
    it("returns 200 with mapped photos and a null cursor on the last page", async () => {
      const photo = buildPhoto();
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildViewerAccess()]) as never);
      prisma.photo.findMany.mockResolvedValue([photo]);

      const response = await request(httpServer).get(photosListPath()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<PhotoListBody>;
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0]).toMatchObject(expectedPhotoResponse(photo, TEST_SIGNED_GET_URL));
      expect(body.data.nextCursor).toBeNull();
      expect(body.meta.path).toBe(photosListPath());
    });

    it("returns 200 with a nextCursor when more photos exist", async () => {
      const first = buildPhoto();
      const second = buildPhoto({ id: TEST_OTHER_PHOTO_ID });
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildViewerAccess()]) as never);
      prisma.photo.findMany.mockResolvedValue([first, second]);

      const response = await request(httpServer)
        .get(photosListPath())
        .query({ limit: 1 })
        .set(authHeader())
        .expect(200);

      const body = response.body as WrappedResponse<PhotoListBody>;
      expect(body.data.items).toHaveLength(1);
      expect(body.data.nextCursor).toBe(encodePhotoCursor(first));
    });

    it("returns 200 and applies a cursor as a keyset filter on the next page", async () => {
      const last = buildPhoto();
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildViewerAccess()]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto({ id: TEST_OTHER_PHOTO_ID })]);

      const response = await request(httpServer)
        .get(photosListPath())
        .query({ cursor: encodePhotoCursor(last), limit: 1 })
        .set(authHeader())
        .expect(200);

      const body = response.body as WrappedResponse<PhotoListBody>;
      expect(body.data.items.map((item) => item.id)).toEqual([TEST_OTHER_PHOTO_ID]);
      expect(body.data.nextCursor).toBeNull();
      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { eventId: TEST_EVENT_ID, status: "READY" },
              expect.anything(),
              { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] },
            ],
          },
          take: 2,
        }),
      );
    });

    it("returns 400 for a malformed cursor", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildViewerAccess()]) as never);

      const response = await request(httpServer)
        .get(photosListPath())
        .query({ cursor: TEST_PHOTO_ID })
        .set(authHeader())
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.INVALID_CURSOR);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid limit", async () => {
      await request(httpServer).get(photosListPath()).query({ limit: 0 }).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(photosListPath()).expect(401);
    });

    it("returns 403 when the caller is not a member of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([]) as never);

      const response = await request(httpServer)
        .get(photosListPath())
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.LIST_FORBIDDEN(TEST_EVENT_ID));
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await request(httpServer).get(photosListPath()).set(authHeader()).expect(404);
    });
  });

  describe("GET /photos/:photoId", () => {
    it("returns 200 with the photo and a presigned download URL for a member", async () => {
      const photo = buildPhoto();
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildViewerAccess()]) as never);

      const response = await request(httpServer).get(photoPath()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<PhotoBody>;
      expect(body.data).toMatchObject(expectedPhotoResponse(photo, TEST_SIGNED_GET_URL));
    });

    it("returns 404 when the photo does not exist", async () => {
      prisma.photo.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).get(photoPath()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.NOT_FOUND(TEST_PHOTO_ID));
    });

    it("returns 404 when the photo is still PENDING", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildViewerAccess()], {
          status: "PENDING",
        }) as never,
      );

      await request(httpServer).get(photoPath()).set(authHeader()).expect(404);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(photoPath()).expect(401);
    });

    it("returns 403 when the caller is not a member of the event", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([]) as never);

      await request(httpServer).get(photoPath()).set(authHeader(TEST_OTHER_ACCESS_TOKEN)).expect(403);
    });
  });

  describe("DELETE /photos/:photoId", () => {
    it("returns 204 when an organizer deletes another member's photo", async () => {
      const photo = photoWithAccess([buildOrganizerAccess()], { addedById: TEST_OTHER_USER_ID });
      prisma.photo.findUnique.mockResolvedValue(photo as never);
      prisma.photo.delete.mockResolvedValue(buildPhoto() as never);

      await request(httpServer).delete(photoPath()).set(authHeader()).expect(204);

      expect(s3Service.deleteObject).toHaveBeenCalledWith(photo.s3Key);
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: TEST_PHOTO_ID } });
    });

    it("returns 204 when the uploader cancels their own pending slot after losing event access", async () => {
      const photo = photoWithAccess([], { status: "PENDING" });
      prisma.photo.findUnique.mockResolvedValue(photo as never);
      prisma.photo.delete.mockResolvedValue(buildPhoto({ status: "PENDING" }) as never);

      await request(httpServer).delete(photoPath()).set(authHeader()).expect(204);

      expect(s3Service.deleteObject).toHaveBeenCalledWith(photo.s3Key);
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: TEST_PHOTO_ID } });
    });

    it("returns 204 and aborts the open multipart upload when a pending multipart slot is deleted", async () => {
      const photo = photoWithAccess([buildParticipantAccess()], buildMultipartPhoto());
      prisma.photo.findUnique.mockResolvedValue(photo as never);
      prisma.photo.delete.mockResolvedValue(buildMultipartPhoto() as never);

      await request(httpServer).delete(photoPath()).set(authHeader()).expect(204);

      expect(s3Service.abortMultipartUpload).toHaveBeenCalledWith({
        key: photo.s3Key,
        uploadId: TEST_MULTIPART_UPLOAD_ID,
      });
      expect(s3Service.abortMultipartUpload.mock.invocationCallOrder[0]).toBeLessThan(
        s3Service.deleteObject.mock.invocationCallOrder[0],
      );
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: TEST_PHOTO_ID } });
    });

    it("returns 403 when a former member deletes their own READY photo", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([]) as never);

      await request(httpServer).delete(photoPath()).set(authHeader()).expect(403);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it("returns 403 when a participant deletes someone else's photo", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], {
          addedById: TEST_OTHER_USER_ID,
        }) as never,
      );

      const response = await request(httpServer).delete(photoPath()).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.DELETE_FORBIDDEN(TEST_PHOTO_ID));
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it("returns 404 when the photo does not exist", async () => {
      prisma.photo.findUnique.mockResolvedValue(null);

      await request(httpServer).delete(photoPath()).set(authHeader()).expect(404);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).delete(photoPath()).expect(401);
    });
  });
});
