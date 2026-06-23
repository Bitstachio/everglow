import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { GALLERY_SERVICE_ERRORS } from "src/galleries/galleries.constants";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { TEST_OTHER_ACCESS_TOKEN, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_EVENT_ID,
  buildEvent,
  buildOrganizerAccess,
  eventWithCallerAccess,
} from "./helpers/events.fixtures";
import { TEST_GALLERY_ID, buildGallery, expectedGalleryResponse } from "./helpers/galleries.fixtures";
import { buildUserWithDetails } from "./helpers/users.fixtures";

const galleriesByEventPath = (eventId = TEST_EVENT_ID) =>
  `/${API_GLOBAL_PREFIX}/events/${eventId}/galleries`;
const galleryPath = (galleryId = TEST_GALLERY_ID) => `/${API_GLOBAL_PREFIX}/galleries/${galleryId}`;

type WrappedResponse<T> = {
  data: T;
  meta: { timestamp: string; path: string };
};

type ErrorResponse = {
  message?: string;
  meta: { timestamp: string; path: string };
};

type GalleryResponseBody = {
  id: string;
  eventId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

describe("GalleriesController (e2e)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;

  beforeAll(async () => {
    const context = await createTestApp();
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
  });

  describe("GET /events/:eventId/galleries", () => {
    it("returns 200 and a mapped gallery list for an event member", async () => {
      const gallery = buildGallery();
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.gallery.findMany.mockResolvedValue([gallery]);

      const response = await request(httpServer).get(galleriesByEventPath()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<GalleryResponseBody[]>;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject(expectedGalleryResponse(gallery));
      expect(body.meta.path).toBe(galleriesByEventPath());
    });

    it("returns 400 when the eventId is not a valid UUID", async () => {
      await request(httpServer).get(galleriesByEventPath("not-a-uuid")).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(galleriesByEventPath()).expect(401);
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).get(galleriesByEventPath()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_FOUND(TEST_EVENT_ID));
    });

    it("returns 403 when the caller is not a member of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), []));

      const response = await request(httpServer)
        .get(galleriesByEventPath())
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(TEST_EVENT_ID));
    });
  });

  describe("GET /galleries/:galleryId", () => {
    it("returns 200 and a mapped gallery for a member", async () => {
      const gallery = buildGallery();
      prisma.gallery.findUnique.mockResolvedValue({
        ...gallery,
        event: { ...buildEvent(), eventAccesses: [buildOrganizerAccess()] },
      } as never);

      const response = await request(httpServer).get(galleryPath()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<GalleryResponseBody>;
      expect(body.data).toMatchObject(expectedGalleryResponse(gallery));
      expect(body.meta.path).toBe(galleryPath());
    });

    it("returns 400 when the galleryId is not a valid UUID", async () => {
      await request(httpServer).get(galleryPath("not-a-uuid")).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(galleryPath()).expect(401);
    });

    it("returns 404 when the gallery does not exist", async () => {
      prisma.gallery.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).get(galleryPath()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(GALLERY_SERVICE_ERRORS.NOT_FOUND(TEST_GALLERY_ID));
    });

    it("returns 403 when the caller is not a member of the parent event", async () => {
      prisma.gallery.findUnique.mockResolvedValue({
        ...buildGallery(),
        event: { ...buildEvent(), eventAccesses: [] },
      } as never);

      const response = await request(httpServer)
        .get(galleryPath())
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(GALLERY_SERVICE_ERRORS.READ_FORBIDDEN(TEST_GALLERY_ID));
    });
  });
});
