import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { PHOTO_SERVICE_ERRORS, FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";
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
  TEST_OTHER_PHOTO_ID,
  TEST_PHOTO_ID,
  TEST_SIGNED_GET_URL,
  TEST_SIGNED_PUT_URL,
  buildPhoto,
  expectedPhotoResponse,
} from "./helpers/photos.fixtures";
import { buildUserWithDetails } from "./helpers/users.fixtures";

const uploadUrlsPath = (eventId = TEST_EVENT_ID) => `/${API_GLOBAL_PREFIX}/events/${eventId}/photos/upload-urls`;
const confirmPath = (eventId = TEST_EVENT_ID) => `/${API_GLOBAL_PREFIX}/events/${eventId}/photos/confirm`;
const photosListPath = (eventId = TEST_EVENT_ID) => `/${API_GLOBAL_PREFIX}/events/${eventId}/photos`;
const photoPath = (photoId = TEST_PHOTO_ID) => `/${API_GLOBAL_PREFIX}/photos/${photoId}`;

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

    for (const mock of Object.values(s3Service)) mock.mockReset();
    s3Service.getPresignedUploadUrl.mockResolvedValue(TEST_SIGNED_PUT_URL);
    s3Service.getPresignedDownloadUrl.mockResolvedValue(TEST_SIGNED_GET_URL);
    s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 });
    s3Service.deleteObject.mockResolvedValue(undefined);
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

    it("returns 413 when the upload would exceed the caller storage quota", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]) as never);
      prisma.photo.aggregate.mockResolvedValue({
        _sum: { sizeBytes: Number(FREE_TIER_STORAGE_LIMIT_BYTES - 512n) },
      } as never);

      const response = await request(httpServer)
        .post(uploadUrlsPath())
        .set(authHeader())
        .send({ files: [{ contentType: "image/jpeg", sizeBytes: 1024 }] })
        .expect(413);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.STORAGE_QUOTA_EXCEEDED);
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
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
        data: { status: "READY" },
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
      expect(body.data.nextCursor).toBe(first.id);
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
