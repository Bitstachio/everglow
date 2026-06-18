import { INestApplication } from "@nestjs/common";
import { AccessLevel, Event, PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { buildInvitationUrl } from "src/events/events.invitation";
import { eventAccessWithUserInclude, eventWithCallerAccessInclude } from "src/events/events.types";
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
  createdAt: string;
  updatedAt: string;
};

type ParticipantResponseBody = {
  userId: string;
  name: string;
  accessLevel: AccessLevel;
};

describe("EventsController (e2e)", () => {
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
      const targetRow = buildEventAccessWithUser(buildTargetParticipantAccess(), buildTargetUserWithDetails());
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.eventAccess.findMany.mockResolvedValue([organizerRow, targetRow]);

      const response = await request(httpServer).get(path()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<ParticipantResponseBody[]>;
      expect(body.data).toEqual([
        { userId: TEST_USER_ID, name: "Jane Doe", accessLevel: AccessLevel.ORGANIZER },
        { userId: TEST_TARGET_USER_ID, name: "Target User", accessLevel: AccessLevel.PARTICIPANT },
      ]);
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
