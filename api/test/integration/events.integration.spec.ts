import { INestApplication } from "@nestjs/common";
import { AccessLevel, Event, PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { EVENT_COVER_S3_KEY_PREFIX, EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { buildInvitationUrl } from "src/events/events.invitation";
import { eventAccessWithUserInclude, eventWithCallerAccessInclude } from "src/events/events.types";
import { buildImageS3Key, IMAGE_UPLOAD_ERRORS, MAX_IMAGE_SIZE_BYTES } from "src/images/images.constants";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import request from "supertest";
import { TEST_OTHER_ACCESS_TOKEN, TEST_OTHER_USER_ID, TEST_TARGET_USER_ID, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_EVENT_ID,
  TEST_INVITE_TOKEN,
  TEST_OTHER_EVENT_ID,
  TEST_OTHER_INVITE_TOKEN,
  buildEvent,
  buildEventAccessWithUser,
  buildOrganizerAccess,
  buildOtherUserEvent,
  buildOtherUserWithDetails,
  buildParticipantAccess,
  buildTargetParticipantAccess,
  buildTargetUserWithDetails,
  buildViewerAccess,
  createEventPayload,
  eventWithCallerAccess,
  expectedEventResponse,
  updateEventPayload,
} from "./helpers/events.fixtures";
import { TEST_USER_ID, buildUserWithDetails, buildUserWithoutDetails } from "./helpers/users.fixtures";

const EVENTS_BASE_PATH = `/${API_GLOBAL_PREFIX}/events`;
const COVER_UPLOAD_URL = "https://s3.example/cover-put?sig=1";
const COVER_URL = "https://s3.example/cover-get?sig=1";
const COVER_UPLOAD_ID = "9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const COVER_S3_KEY = buildImageS3Key(EVENT_COVER_S3_KEY_PREFIX, TEST_EVENT_ID, COVER_UPLOAD_ID);

type WrappedResponse<T> = {
  data: T;
  meta: {
    timestamp: string;
    path: string;
  };
};

type ErrorResponse = {
  message?: string;
  meta: {
    timestamp: string;
    path: string;
  };
};

type EventResponseBody = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  creatorId: string;
  invitationUrl: string;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type ParticipantResponseBody = {
  userId: string;
  name: string;
  accessLevel: AccessLevel;
  avatarUrl: string | null;
};

describe("EventsController (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;

  const s3Service = {
    deleteObjects: jest.fn(),
    deleteObject: jest.fn(),
    headObject: jest.fn(),
    getPresignedUploadUrl: jest.fn(),
    getPresignedDownloadUrl: jest.fn(),
  };

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
    // Interactive transactions run their callback against the same mock client.
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.photo.findMany.mockResolvedValue([]);
    Object.values(s3Service).forEach((mock) => mock.mockReset());
    s3Service.deleteObjects.mockResolvedValue({ deleted: [], failed: [] });
    s3Service.deleteObject.mockResolvedValue(undefined);
    s3Service.getPresignedUploadUrl.mockResolvedValue(COVER_UPLOAD_URL);
    s3Service.getPresignedDownloadUrl.mockResolvedValue(COVER_URL);
  });

  describe("POST /events", () => {
    const path = EVENTS_BASE_PATH;

    it("returns 201 and a mapped event response on success", async () => {
      const payload = createEventPayload();
      const createdEvent = buildEvent();

      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.event.create.mockResolvedValue(createdEvent);

      const response = await request(httpServer).post(path).set(authHeader()).send(payload).expect(201);

      const body = response.body as WrappedResponse<EventResponseBody>;
      expect(body.data).toMatchObject(expectedEventResponse(createdEvent));
      expect(body.data.invitationUrl).toBe(buildInvitationUrl(createdEvent.invitationUrl));
      expect(body.meta.path).toBe(path);

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
    });

    it("returns 400 when the payload fails validation", async () => {
      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send({ title: "", date: "not-a-date" })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 400 when unknown properties are sent", async () => {
      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send({ ...createEventPayload(), unexpectedField: true })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).post(path).send(createEventPayload()).expect(401);
    });

    it("returns 404 when the authenticated creator does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).post(path).set(authHeader()).send(createEventPayload()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.CREATOR_NOT_FOUND(TEST_USER_ID));
    });

    it("returns 422 when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());

      const response = await request(httpServer).post(path).set(authHeader()).send(createEventPayload()).expect(422);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);
    });
  });

  describe("GET /events", () => {
    const path = EVENTS_BASE_PATH;

    it("returns 200 and a mapped list of events", async () => {
      const events = [buildEvent(), buildOtherUserEvent({ creatorId: TEST_USER_ID })];
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.event.findMany.mockResolvedValue(events);

      const response = await request(httpServer).get(path).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<EventResponseBody[]>;
      expect(body.data).toHaveLength(2);
      expect(body.data[0]).toMatchObject(expectedEventResponse(events[0]));
      expect(body.meta.path).toBe(path);
    });

    it("returns 200 and an empty list when the user is not onboarded", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());

      const response = await request(httpServer).get(path).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<EventResponseBody[]>;
      expect(body.data).toEqual([]);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(path).expect(401);
    });
  });

  describe("POST /events/join", () => {
    const path = `${EVENTS_BASE_PATH}/join`;

    it("returns 200 and joins using a bare invite token", async () => {
      const event = buildEvent();
      prisma.user.findUnique.mockResolvedValue(buildOtherUserWithDetails());
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.eventAccess.findUnique.mockResolvedValue(null);
      prisma.eventAccess.create.mockResolvedValue(buildParticipantAccess({ userId: TEST_OTHER_USER_ID }));

      const response = await request(httpServer)
        .post(path)
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .send({ invitationUrl: TEST_INVITE_TOKEN })
        .expect(201);

      const body = response.body as WrappedResponse<EventResponseBody>;
      expect(body.data).toMatchObject(expectedEventResponse(event));
      expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { invitationUrl: TEST_INVITE_TOKEN } });
    });

    it("extracts the invite token from a full invitation URL", async () => {
      const event = buildEvent();
      prisma.user.findUnique.mockResolvedValue(buildOtherUserWithDetails());
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.eventAccess.findUnique.mockResolvedValue(null);
      prisma.eventAccess.create.mockResolvedValue(buildParticipantAccess({ userId: TEST_OTHER_USER_ID }));

      await request(httpServer)
        .post(path)
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .send({ invitationUrl: buildInvitationUrl(TEST_INVITE_TOKEN) })
        .expect(201);

      expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { invitationUrl: TEST_INVITE_TOKEN } });
    });

    it("returns 400 when invitationUrl is missing", async () => {
      await request(httpServer).post(path).set(authHeader()).send({}).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).post(path).send({ invitationUrl: TEST_INVITE_TOKEN }).expect(401);
    });

    it("returns 404 when the invitation URL does not match any event", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.event.findUnique.mockResolvedValue(null);

      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send({ invitationUrl: "missing-token" })
        .expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.INVITATION_NOT_FOUND("missing-token"));
    });

    it("returns 409 when the caller has already joined", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.event.findUnique.mockResolvedValue(buildEvent());
      prisma.eventAccess.findUnique.mockResolvedValue(buildOrganizerAccess());

      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send({ invitationUrl: TEST_INVITE_TOKEN })
        .expect(409);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.ALREADY_JOINED(TEST_EVENT_ID));
    });

    it("returns 422 when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());

      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send({ invitationUrl: TEST_INVITE_TOKEN })
        .expect(422);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);
    });
  });

  describe("GET /events/:eventId", () => {
    const path = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}`;

    it("returns 200 and a mapped event response", async () => {
      const event = buildEvent();
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(event, [buildOrganizerAccess()]));

      const response = await request(httpServer).get(path()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<EventResponseBody>;
      expect(body.data).toMatchObject(expectedEventResponse(event));
      expect(body.meta.path).toBe(path());

      expect(prisma.event.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_EVENT_ID },
        include: eventWithCallerAccessInclude(TEST_USER_ID),
      });
    });

    it("returns 400 when eventId is not a valid UUID", async () => {
      await request(httpServer).get(`${EVENTS_BASE_PATH}/not-a-uuid`).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(path()).expect(401);
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).get(path()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_FOUND(TEST_EVENT_ID));
    });

    it("returns 403 when the caller cannot read the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), []));

      const response = await request(httpServer).get(path()).set(authHeader(TEST_OTHER_ACCESS_TOKEN)).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(TEST_EVENT_ID));
    });
  });

  describe("PATCH /events/:eventId", () => {
    const path = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}`;

    it("returns 200 and a mapped updated event", async () => {
      const payload = updateEventPayload();
      const updatedEvent: Event = { ...buildEvent(), title: payload.title! };
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.event.update.mockResolvedValue(updatedEvent);

      const response = await request(httpServer).patch(path()).set(authHeader()).send(payload).expect(200);

      const body = response.body as WrappedResponse<EventResponseBody>;
      expect(body.data.title).toBe(payload.title);
      expect(body.meta.path).toBe(path());
    });

    it("returns 400 when the payload fails validation", async () => {
      await request(httpServer).patch(path()).set(authHeader()).send({ title: "" }).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).patch(path()).send(updateEventPayload()).expect(401);
    });

    it("returns 403 when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildParticipantAccess()]));

      const response = await request(httpServer).patch(path()).set(authHeader()).send(updateEventPayload()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(TEST_EVENT_ID));
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).patch(path()).set(authHeader()).send(updateEventPayload()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_FOUND(TEST_EVENT_ID));
    });
  });

  describe("DELETE /events/:eventId", () => {
    const path = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}`;

    it("returns 204 when the organizer deletes the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.event.delete.mockResolvedValue(buildEvent());

      await request(httpServer).delete(path()).set(authHeader()).expect(204);

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: TEST_EVENT_ID } });
      expect(s3Service.deleteObjects).not.toHaveBeenCalled();
    });

    it("returns 204 and purges the event's photo objects from S3 after the rows are gone", async () => {
      const s3Keys = [`photos/${TEST_USER_ID}/${TEST_EVENT_ID}/a`, `photos/${TEST_USER_ID}/${TEST_EVENT_ID}/b`];
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.photo.findMany.mockResolvedValue(s3Keys.map((s3Key) => ({ s3Key })) as never);
      prisma.event.delete.mockResolvedValue(buildEvent());
      s3Service.deleteObjects.mockResolvedValue({ deleted: s3Keys, failed: [] });

      await request(httpServer).delete(path()).set(authHeader()).expect(204);

      expect(prisma.photo.findMany).toHaveBeenCalledWith({
        where: { eventId: TEST_EVENT_ID },
        select: { s3Key: true },
      });
      expect(s3Service.deleteObjects).toHaveBeenCalledWith(s3Keys);
      expect(prisma.event.delete.mock.invocationCallOrder[0]).toBeLessThan(
        s3Service.deleteObjects.mock.invocationCallOrder[0],
      );
    });

    it("returns 204 and purges the event's cover object along with its photos", async () => {
      const photoKey = `photos/${TEST_USER_ID}/${TEST_EVENT_ID}/a`;
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.photo.findMany.mockResolvedValue([{ s3Key: photoKey }] as never);
      prisma.event.delete.mockResolvedValue(buildEvent({ coverS3Key: COVER_S3_KEY }));

      await request(httpServer).delete(path()).set(authHeader()).expect(204);

      expect(s3Service.deleteObjects).toHaveBeenCalledTimes(1);
      expect(s3Service.deleteObjects).toHaveBeenCalledWith([photoKey, COVER_S3_KEY]);
    });

    it("returns 204 even when the S3 purge fails, leaving the objects to the reconciler", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.photo.findMany.mockResolvedValue([{ s3Key: `photos/${TEST_USER_ID}/${TEST_EVENT_ID}/a` }] as never);
      prisma.event.delete.mockResolvedValue(buildEvent());
      s3Service.deleteObjects.mockRejectedValue(new Error("s3 down"));

      await request(httpServer).delete(path()).set(authHeader()).expect(204);

      expect(prisma.event.delete).toHaveBeenCalledTimes(1);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).delete(path()).expect(401);
    });

    it("returns 403 when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildParticipantAccess()]));

      const response = await request(httpServer).delete(path()).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.DELETE_FORBIDDEN(TEST_EVENT_ID));
    });
  });

  describe("POST /events/:eventId/leave", () => {
    const path = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}/leave`;

    it("returns 204 when a participant leaves the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildParticipantAccess()]));
      prisma.eventAccess.delete.mockResolvedValue(buildParticipantAccess());

      await request(httpServer).post(path()).set(authHeader()).expect(204);

      expect(prisma.eventAccess.delete).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: TEST_USER_ID, eventId: TEST_EVENT_ID } },
      });
    });

    it("returns 403 when the caller is not a member", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), []));

      const response = await request(httpServer).post(path()).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(TEST_EVENT_ID, TEST_USER_ID));
    });

    it("returns 422 when the sole organizer attempts to leave", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.eventAccess.count.mockResolvedValue(1);

      const response = await request(httpServer).post(path()).set(authHeader()).expect(422);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(TEST_EVENT_ID));
    });
  });

  describe("GET /events/:eventId/participants", () => {
    const path = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}/participants`;

    it("returns 200 and a mapped participant roster", async () => {
      const organizerRow = buildEventAccessWithUser(buildOrganizerAccess(), buildUserWithDetails());
      const target = buildTargetUserWithDetails();
      const avatarS3Key = `avatars/${TEST_TARGET_USER_ID}/99999999-9999-9999-9999-999999999999`;
      const targetRow = buildEventAccessWithUser(buildTargetParticipantAccess(), {
        ...target,
        details: { ...target.details!, avatarS3Key },
      });
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow, targetRow]);
      s3Service.getPresignedDownloadUrl.mockResolvedValue("https://s3.example/avatar?sig=1");

      const response = await request(httpServer).get(path()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<ParticipantResponseBody[]>;
      expect(body.data).toEqual([
        { userId: TEST_USER_ID, name: "Jane Doe", accessLevel: AccessLevel.ORGANIZER, avatarUrl: null },
        {
          userId: TEST_TARGET_USER_ID,
          name: "Target User",
          accessLevel: AccessLevel.PARTICIPANT,
          avatarUrl: "https://s3.example/avatar?sig=1",
        },
      ]);
      // One presign for the one member with an avatar, and the key never leaves the API.
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledTimes(1);
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({ key: avatarS3Key }));
      expect(JSON.stringify(body.data)).not.toContain("avatarS3Key");
      expect(prisma.eventAccess.findMany).toHaveBeenCalledWith({
        where: { eventId: TEST_EVENT_ID },
        include: eventAccessWithUserInclude,
        orderBy: { createdAt: "asc" },
      });
    });

    it("returns 403 when the caller cannot read the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), []));

      const response = await request(httpServer).get(path()).set(authHeader(TEST_OTHER_ACCESS_TOKEN)).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(TEST_EVENT_ID));
    });
  });

  describe("PUT /events/:eventId/participants/:targetUserId/access", () => {
    const path = (targetUserId = TEST_TARGET_USER_ID) =>
      `${EVENTS_BASE_PATH}/${TEST_EVENT_ID}/participants/${targetUserId}/access`;

    it("returns 200 and the updated participant response", async () => {
      const targetAccessWithUser = buildEventAccessWithUser(
        buildTargetParticipantAccess({ accessLevel: AccessLevel.ORGANIZER }),
        buildTargetUserWithDetails(),
      );
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.eventAccess.findUnique.mockResolvedValue(
        buildEventAccessWithUser(buildTargetParticipantAccess(), buildTargetUserWithDetails()),
      );
      prisma.eventAccess.update.mockResolvedValue(targetAccessWithUser);

      const response = await request(httpServer)
        .put(path())
        .set(authHeader())
        .send({ accessLevel: AccessLevel.ORGANIZER })
        .expect(200);

      const body = response.body as WrappedResponse<ParticipantResponseBody>;
      expect(body.data).toEqual({
        userId: TEST_TARGET_USER_ID,
        name: "Target User",
        accessLevel: AccessLevel.ORGANIZER,
        avatarUrl: null,
      });
    });

    it("returns 403 when the caller tries to modify their own access", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));

      const response = await request(httpServer)
        .put(path(TEST_USER_ID))
        .set(authHeader())
        .send({ accessLevel: AccessLevel.PARTICIPANT })
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.CANNOT_MODIFY_OWN_ACCESS);
    });

    it("returns 403 when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildParticipantAccess()]));

      const response = await request(httpServer)
        .put(path())
        .set(authHeader())
        .send({ accessLevel: AccessLevel.VIEWER })
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(TEST_EVENT_ID));
    });
  });

  describe("DELETE /events/:eventId/participants/:targetUserId", () => {
    const path = (targetUserId = TEST_TARGET_USER_ID) =>
      `${EVENTS_BASE_PATH}/${TEST_EVENT_ID}/participants/${targetUserId}`;

    it("returns 204 when an organizer removes a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.eventAccess.findUnique.mockResolvedValue(buildTargetParticipantAccess());
      prisma.eventAccess.delete.mockResolvedValue(buildTargetParticipantAccess());

      await request(httpServer).delete(path()).set(authHeader()).expect(204);

      expect(prisma.eventAccess.delete).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: TEST_TARGET_USER_ID, eventId: TEST_EVENT_ID } },
      });
    });

    it("returns 403 when the caller tries to remove themselves", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));

      const response = await request(httpServer).delete(path(TEST_USER_ID)).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.CANNOT_REMOVE_SELF);
    });

    it("returns 422 when removing the sole organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.eventAccess.findUnique.mockResolvedValue(buildOrganizerAccess({ userId: TEST_TARGET_USER_ID }));
      prisma.eventAccess.count.mockResolvedValue(1);

      const response = await request(httpServer).delete(path()).set(authHeader()).expect(422);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(TEST_EVENT_ID));
    });
  });

  describe("POST /events/:eventId/regenerate-url", () => {
    const path = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}/regenerate-url`;

    it("returns 200 and a mapped event with a new invitation URL", async () => {
      const updatedEvent = buildEvent({ invitationUrl: "new-invite-token" });
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.event.update.mockResolvedValue(updatedEvent);

      const response = await request(httpServer).post(path()).set(authHeader()).expect(201);

      const body = response.body as WrappedResponse<EventResponseBody>;
      expect(body.data.invitationUrl).toBe(buildInvitationUrl("new-invite-token"));
      expect(body.meta.path).toBe(path());
    });

    it("returns 403 when the caller is a participant", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildParticipantAccess()]));

      const response = await request(httpServer).post(path()).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(TEST_EVENT_ID));
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).post(path()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_FOUND(TEST_EVENT_ID));
    });
  });

  describe("cover", () => {
    const uploadUrlPath = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}/cover/upload-url`;
    const coverPath = (eventId = TEST_EVENT_ID) => `${EVENTS_BASE_PATH}/${eventId}/cover`;

    const organizedEvent = (coverS3Key: string | null) =>
      eventWithCallerAccess(buildEvent({ coverS3Key }), [buildOrganizerAccess()]);

    const uploadedObject = (contentType = "image/jpeg") => ({
      exists: true,
      contentType,
      sizeBytes: 2048,
      lastModified: new Date(),
    });

    // Every cover route authorizes like PATCH /events/:eventId: 404 for a
    // missing event, 403 for anyone who may not update it, member or not.
    const itAuthorizesLikeAnEventUpdate = (send: (headers: Record<string, string>) => request.Test) => {
      const expectNothingTouched = () => {
        expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
        expect(s3Service.headObject).not.toHaveBeenCalled();
        expect(s3Service.deleteObject).not.toHaveBeenCalled();
        expect(prisma.event.updateMany).not.toHaveBeenCalled();
      };

      it("returns 401 when the access token is missing", async () => {
        await send({}).expect(401);

        expectNothingTouched();
      });

      it("returns 403 when the caller is a member but not an organizer", async () => {
        prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildParticipantAccess()]));

        const response = await send(authHeader()).expect(403);

        expect((response.body as ErrorResponse).message).toBe(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(TEST_EVENT_ID));
        expectNothingTouched();
      });

      it("returns the same 403 when the caller is not a member at all", async () => {
        prisma.user.findUnique.mockResolvedValue(buildOtherUserWithDetails());
        prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), []));

        const response = await send(authHeader(TEST_OTHER_ACCESS_TOKEN)).expect(403);

        expect((response.body as ErrorResponse).message).toBe(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(TEST_EVENT_ID));
        expectNothingTouched();
      });

      it("returns 404 when the event does not exist", async () => {
        prisma.event.findUnique.mockResolvedValue(null);

        const response = await send(authHeader()).expect(404);

        expect((response.body as ErrorResponse).message).toBe(EVENT_SERVICE_ERRORS.NOT_FOUND(TEST_EVENT_ID));
        expectNothingTouched();
      });
    };

    describe("coverUrl on event reads", () => {
      it("returns a presigned coverUrl on the single read and never the S3 key", async () => {
        const event = buildEvent({ coverS3Key: COVER_S3_KEY });
        prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(event, [buildViewerAccess()]));

        const response = await request(httpServer)
          .get(`${EVENTS_BASE_PATH}/${TEST_EVENT_ID}`)
          .set(authHeader())
          .expect(200);

        const body = response.body as WrappedResponse<EventResponseBody>;
        expect(body.data).toEqual(expectedEventResponse(event, COVER_URL));
        expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({ key: COVER_S3_KEY }));
        expect(JSON.stringify(response.body)).not.toContain("coverS3Key");
      });

      it("returns a coverUrl per listed event from the one list query", async () => {
        const events = [buildEvent({ coverS3Key: COVER_S3_KEY }), buildOtherUserEvent()];
        prisma.event.findMany.mockResolvedValue(events);

        const response = await request(httpServer).get(EVENTS_BASE_PATH).set(authHeader()).expect(200);

        const body = response.body as WrappedResponse<EventResponseBody[]>;
        expect(body.data).toEqual([expectedEventResponse(events[0], COVER_URL), expectedEventResponse(events[1])]);
        // The caller lookup for the ability plus the list itself: covers add no query, per row or otherwise.
        expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.event.findUnique).not.toHaveBeenCalled();
        expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledTimes(1);
      });
    });

    describe("POST /events/:eventId/cover/upload-url", () => {
      const payload = { contentType: "image/jpeg", sizeBytes: 2048 };

      it("returns 201 with an upload id and a presigned URL under the event's own prefix", async () => {
        prisma.event.findUnique.mockResolvedValue(organizedEvent(null));

        const response = await request(httpServer).post(uploadUrlPath()).set(authHeader()).send(payload).expect(201);

        const body = response.body as WrappedResponse<{ uploadId: string; uploadUrl: string }>;
        expect(body.data).toEqual({ uploadId: expect.any(String) as string, uploadUrl: COVER_UPLOAD_URL });
        expect(body.meta.path).toBe(uploadUrlPath());
        expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith(
          expect.objectContaining({
            key: buildImageS3Key(EVENT_COVER_S3_KEY_PREFIX, TEST_EVENT_ID, body.data.uploadId),
            contentType: "image/jpeg",
            contentLength: 2048,
          }),
        );
        expect(prisma.event.updateMany).not.toHaveBeenCalled();
      });

      it.each([
        ["an unsupported content type", { ...payload, contentType: "image/heic" }],
        ["an oversize image", { ...payload, sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 }],
        ["a client-supplied key", { ...payload, key: "event-covers/another-event/x" }],
      ])("returns 400 for %s", async (_label, body) => {
        await request(httpServer).post(uploadUrlPath()).set(authHeader()).send(body).expect(400);

        expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
      });

      it("returns 400 when eventId is not a valid UUID", async () => {
        await request(httpServer).post(uploadUrlPath("not-a-uuid")).set(authHeader()).send(payload).expect(400);
      });

      describe("authorization", () => {
        itAuthorizesLikeAnEventUpdate((headers) =>
          request(httpServer).post(uploadUrlPath()).set(headers).send(payload),
        );
      });
    });

    describe("PUT /events/:eventId/cover", () => {
      const payload = { uploadId: COVER_UPLOAD_ID };

      it("returns 200 with the event carrying the new coverUrl", async () => {
        const confirmed = buildEvent({ coverS3Key: COVER_S3_KEY });
        prisma.event.findUnique
          .mockResolvedValueOnce(organizedEvent(null))
          .mockResolvedValueOnce(eventWithCallerAccess(confirmed, [buildOrganizerAccess()]));
        prisma.event.updateMany.mockResolvedValue({ count: 1 });
        s3Service.headObject.mockResolvedValue(uploadedObject());

        const response = await request(httpServer).put(coverPath()).set(authHeader()).send(payload).expect(200);

        const body = response.body as WrappedResponse<EventResponseBody>;
        expect(body.data).toEqual(expectedEventResponse(confirmed, COVER_URL));
        expect(body.meta.path).toBe(coverPath());
        expect(s3Service.headObject).toHaveBeenCalledWith(COVER_S3_KEY);
        expect(prisma.event.updateMany).toHaveBeenCalledWith({
          where: { id: TEST_EVENT_ID, coverS3Key: null },
          data: { coverS3Key: COVER_S3_KEY },
        });
      });

      it("returns 404 when nothing was uploaded for that id", async () => {
        prisma.event.findUnique.mockResolvedValue(organizedEvent(null));
        s3Service.headObject.mockResolvedValue({ exists: false });

        const response = await request(httpServer).put(coverPath()).set(authHeader()).send(payload).expect(404);

        expect((response.body as ErrorResponse).message).toBe(IMAGE_UPLOAD_ERRORS.UPLOAD_NOT_FOUND(COVER_UPLOAD_ID));
        expect(prisma.event.updateMany).not.toHaveBeenCalled();
      });

      it("returns 409 when another organizer changed the cover first", async () => {
        prisma.event.findUnique.mockResolvedValue(organizedEvent(null));
        prisma.event.updateMany.mockResolvedValue({ count: 0 });
        s3Service.headObject.mockResolvedValue(uploadedObject());

        const response = await request(httpServer).put(coverPath()).set(authHeader()).send(payload).expect(409);

        expect((response.body as ErrorResponse).message).toBe(EVENT_SERVICE_ERRORS.COVER_CHANGED_CONCURRENTLY);
      });

      it("returns 422 and discards an object of a disallowed type", async () => {
        prisma.event.findUnique.mockResolvedValue(organizedEvent(null));
        s3Service.headObject.mockResolvedValue(uploadedObject("image/gif"));

        const response = await request(httpServer).put(coverPath()).set(authHeader()).send(payload).expect(422);

        expect((response.body as ErrorResponse).message).toBe(IMAGE_UPLOAD_ERRORS.UPLOAD_REJECTED(COVER_UPLOAD_ID));
        expect(s3Service.deleteObject).toHaveBeenCalledWith(COVER_S3_KEY);
        expect(prisma.event.updateMany).not.toHaveBeenCalled();
      });

      it.each([
        ["a non-UUID upload id", { uploadId: "../another-event" }],
        ["a client-supplied key", { uploadId: COVER_UPLOAD_ID, key: "event-covers/another-event/x" }],
        ["an empty body", {}],
      ])("returns 400 for %s", async (_label, body) => {
        await request(httpServer).put(coverPath()).set(authHeader()).send(body).expect(400);

        expect(s3Service.headObject).not.toHaveBeenCalled();
      });

      describe("authorization", () => {
        itAuthorizesLikeAnEventUpdate((headers) => request(httpServer).put(coverPath()).set(headers).send(payload));
      });
    });

    describe("DELETE /events/:eventId/cover", () => {
      it("returns 204 after deleting the object and clearing the column", async () => {
        prisma.event.findUnique.mockResolvedValue(organizedEvent(COVER_S3_KEY));
        prisma.event.updateMany.mockResolvedValue({ count: 1 });

        await request(httpServer).delete(coverPath()).set(authHeader()).expect(204);

        expect(s3Service.deleteObject).toHaveBeenCalledWith(COVER_S3_KEY);
        expect(prisma.event.updateMany).toHaveBeenCalledWith({
          where: { id: TEST_EVENT_ID, coverS3Key: COVER_S3_KEY },
          data: { coverS3Key: null },
        });
      });

      it("returns 204 when there is no cover to remove", async () => {
        prisma.event.findUnique.mockResolvedValue(organizedEvent(null));

        await request(httpServer).delete(coverPath()).set(authHeader()).expect(204);

        expect(s3Service.deleteObject).not.toHaveBeenCalled();
      });

      describe("authorization", () => {
        itAuthorizesLikeAnEventUpdate((headers) => request(httpServer).delete(coverPath()).set(headers));
      });
    });
  });

  describe("authorization flows across endpoints", () => {
    it("allows a viewer to read an event and list participants but not update it", async () => {
      const event = buildEvent();
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(event, [buildViewerAccess()]));
      prisma.eventAccess.findMany.mockResolvedValue([
        buildEventAccessWithUser(buildOrganizerAccess(), buildUserWithDetails()),
      ]);

      await request(httpServer).get(`${EVENTS_BASE_PATH}/${TEST_EVENT_ID}`).set(authHeader()).expect(200);
      await request(httpServer).get(`${EVENTS_BASE_PATH}/${TEST_EVENT_ID}/participants`).set(authHeader()).expect(200);

      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(event, [buildViewerAccess()]));

      const response = await request(httpServer)
        .patch(`${EVENTS_BASE_PATH}/${TEST_EVENT_ID}`)
        .set(authHeader())
        .send(updateEventPayload())
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(TEST_EVENT_ID));
    });

    it("allows another user to join via invite and then read the event", async () => {
      const event = buildOtherUserEvent();
      prisma.user.findUnique.mockResolvedValue(buildOtherUserWithDetails());
      prisma.event.findUnique.mockResolvedValueOnce(event);
      prisma.eventAccess.findUnique.mockResolvedValue(null);
      prisma.eventAccess.create.mockResolvedValue(
        buildParticipantAccess({ userId: TEST_OTHER_USER_ID, eventId: TEST_OTHER_EVENT_ID }),
      );

      await request(httpServer)
        .post(`${EVENTS_BASE_PATH}/join`)
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .send({ invitationUrl: TEST_OTHER_INVITE_TOKEN })
        .expect(201);

      prisma.event.findUnique.mockResolvedValue(
        eventWithCallerAccess(event, [
          buildParticipantAccess({ userId: TEST_OTHER_USER_ID, eventId: TEST_OTHER_EVENT_ID }),
        ]),
      );

      const response = await request(httpServer)
        .get(`${EVENTS_BASE_PATH}/${TEST_OTHER_EVENT_ID}`)
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .expect(200);

      const body = response.body as WrappedResponse<EventResponseBody>;
      expect(body.data.id).toBe(TEST_OTHER_EVENT_ID);
    });
  });
});
