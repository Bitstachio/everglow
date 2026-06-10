import { INestApplication } from "@nestjs/common";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import request from "supertest";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { userWithDetailsInclude } from "src/users/users.types";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_ACCESS_TOKEN,
  TEST_USER_ID,
  buildUserWithDetails,
  buildUserWithoutDetails,
  createUserDetailsPayload,
  updateUserPayload,
} from "./helpers/users.fixtures";

const USERS_BASE_PATH = `/${API_GLOBAL_PREFIX}/users`;

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

const authHeader = (token = TEST_ACCESS_TOKEN) => ({
  Authorization: `Bearer ${token}`,
});

describe("UsersController (e2e)", () => {
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
    // mockReset (unlike jest.clearAllMocks) also removes mockResolvedValue
    // implementations, preventing stubs from leaking between tests
    mockReset(prisma);
  });

  describe("POST /users/me/onboarding", () => {
    const path = `${USERS_BASE_PATH}/me/onboarding`;

    it("returns 201 and the onboarded user profile on success", async () => {
      const payload = createUserDetailsPayload();
      const onboardedUser = buildUserWithDetails();

      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue(onboardedUser);

      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send(payload)
        .expect(201);

      const body = response.body as WrappedResponse<{
        id: string;
        isOnboarded: boolean;
        details: { email: string; name: string; createdAt: string; updatedAt: string };
        createdAt: string;
        updatedAt: string;
      }>;

      expect(body.data).toMatchObject({
        id: TEST_USER_ID,
        isOnboarded: true,
        details: {
          email: payload.email,
          name: payload.name,
        },
      });
      expect(body.meta.path).toBe(path);
      expect(body.meta.timestamp).toEqual(expect.any(String));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
        data: {
          details: {
            create: {
              email: payload.email,
              name: payload.name,
            },
          },
        },
        include: userWithDetailsInclude,
      });
    });

    it("returns 400 when the payload fails validation", async () => {
      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send({ name: "", email: "not-an-email" })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 400 when unknown properties are sent", async () => {
      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send({
          ...createUserDetailsPayload(),
          unexpectedField: "should-not-be-here",
        })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 401 when the access token is missing", async () => {
      const response = await request(httpServer).post(path).send(createUserDetailsPayload()).expect(401);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 409 when onboarding was already completed", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());

      const response = await request(httpServer)
        .post(path)
        .set(authHeader())
        .send(createUserDetailsPayload())
        .expect(409);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.DETAILS_ALREADY_EXIST(TEST_USER_ID));
      expect(body.meta.path).toBe(path);
    });

    it("returns 409 when the email is already taken", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());
      prisma.userDetails.count.mockResolvedValue(1);

      const payload = createUserDetailsPayload({ email: "taken@example.com" });
      const response = await request(httpServer).post(path).set(authHeader()).send(payload).expect(409);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.EMAIL_TAKEN(payload.email));
      expect(body.meta.path).toBe(path);
    });
  });

  describe("GET /users/me", () => {
    const path = `${USERS_BASE_PATH}/me`;

    it("returns 200 and the current user profile", async () => {
      const user = buildUserWithDetails();
      prisma.user.findUnique.mockResolvedValue(user);

      const response = await request(httpServer).get(path).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<{
        id: string;
        isOnboarded: boolean;
        details: { email: string; name: string } | null;
      }>;

      expect(body.data).toMatchObject({
        id: TEST_USER_ID,
        isOnboarded: true,
        details: {
          email: user.details!.email,
          name: user.details!.name,
        },
      });
      expect(body.meta.path).toBe(path);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
        include: userWithDetailsInclude,
      });
    });

    it("returns 401 when the access token is missing", async () => {
      const response = await request(httpServer).get(path).expect(401);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 404 when the authenticated user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).get(path).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.NOT_FOUND(TEST_USER_ID));
      expect(body.meta.path).toBe(path);
    });
  });

  describe("PATCH /users/me", () => {
    const path = `${USERS_BASE_PATH}/me`;

    it("returns 200 and the updated user profile", async () => {
      const existingUser = buildUserWithDetails();
      const payload = updateUserPayload();
      const updatedUser = buildUserWithDetails({
        details: {
          ...existingUser.details!,
          name: payload.name!,
        },
      });

      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue(updatedUser);

      const response = await request(httpServer).patch(path).set(authHeader()).send(payload).expect(200);

      const body = response.body as WrappedResponse<{
        id: string;
        details: { name: string };
      }>;

      expect(body.data.id).toBe(TEST_USER_ID);
      expect(body.data.details.name).toBe(payload.name);
      expect(body.meta.path).toBe(path);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
        data: {
          details: {
            update: payload,
          },
        },
        include: userWithDetailsInclude,
      });
    });

    it("returns 400 when the payload contains invalid values", async () => {
      const response = await request(httpServer)
        .patch(path)
        .set(authHeader())
        .send({ email: "invalid-email" })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 400 when unknown properties are sent", async () => {
      const response = await request(httpServer)
        .patch(path)
        .set(authHeader())
        .send({ name: "Valid Name", role: "admin" })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 401 when the access token is missing", async () => {
      const response = await request(httpServer).patch(path).send(updateUserPayload()).expect(401);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 404 when the authenticated user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).patch(path).set(authHeader()).send(updateUserPayload()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.NOT_FOUND(TEST_USER_ID));
      expect(body.meta.path).toBe(path);
    });

    it("returns 422 when onboarding is incomplete", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());

      const response = await request(httpServer).patch(path).set(authHeader()).send(updateUserPayload()).expect(422);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);
      expect(body.meta.path).toBe(path);
    });

    it("returns 409 when the new email is already taken", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.userDetails.count.mockResolvedValue(1);

      const payload = updateUserPayload({ email: "taken@example.com" });
      const response = await request(httpServer).patch(path).set(authHeader()).send(payload).expect(409);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.EMAIL_TAKEN(payload.email!));
      expect(body.meta.path).toBe(path);
    });
  });

  describe("DELETE /users/me", () => {
    const path = `${USERS_BASE_PATH}/me`;

    it("returns 204 when the user is deleted successfully", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.user.delete.mockResolvedValue(buildUserWithDetails());

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
      });
    });

    it("returns 401 when the access token is missing", async () => {
      const response = await request(httpServer).delete(path).expect(401);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });

    it("returns 404 when the authenticated user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).delete(path).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.NOT_FOUND(TEST_USER_ID));
      expect(body.meta.path).toBe(path);
    });
  });
});
