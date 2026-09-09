import { INestApplication } from "@nestjs/common";
import { AccessLevel, PhotoStatus, PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { hashProviderSub } from "src/users/deleted-account";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { userWithDetailsInclude } from "src/users/users.types";
import request from "supertest";
import { TEST_OTHER_USER_ID, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_USER_ID,
  buildUserWithDetails,
  buildUserWithoutDetails,
  createUserDetailsPayload,
  updateUserPayload,
} from "./helpers/users.fixtures";

const USERS_BASE_PATH = `/${API_GLOBAL_PREFIX}/users`;
const ONE_GIB = 1024n ** 3n;

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

describe("UsersController (e2e)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;

  const s3Service = { deleteObjects: jest.fn() };

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
    // mockReset (unlike jest.clearAllMocks) also removes mockResolvedValue
    // implementations, preventing stubs from leaking between tests
    mockReset(prisma);
    s3Service.deleteObjects.mockReset();
    s3Service.deleteObjects.mockResolvedValue({ deleted: [], failed: [] });
  });

  describe("POST /users/me/onboarding", () => {
    const path = `${USERS_BASE_PATH}/me/onboarding`;

    it("returns 201 and the onboarded user profile on success", async () => {
      const payload = createUserDetailsPayload();
      const onboardedUser = buildUserWithDetails();

      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());
      prisma.userDetails.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue(onboardedUser);

      const response = await request(httpServer).post(path).set(authHeader()).send(payload).expect(201);

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

  describe("GET /users/me/storage", () => {
    const path = `${USERS_BASE_PATH}/me/storage`;

    type StorageBody = { usedBytes: string; limitBytes: string; remainingBytes: string };

    it("returns 200 and the caller storage usage against their own limit", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails({ storageLimitBytes: ONE_GIB }));
      prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 2048 } } as never);

      const response = await request(httpServer).get(path).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<StorageBody>;
      expect(body.data).toEqual({
        usedBytes: "2048",
        limitBytes: "1073741824",
        remainingBytes: "1073739776",
      });
      expect(body.meta.path).toBe(path);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
        select: { storageLimitBytes: true },
      });
    });

    it("returns the free-tier default for a user whose limit was never raised", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } } as never);

      const response = await request(httpServer).get(path).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<StorageBody>;
      expect(body.data).toEqual({
        usedBytes: "0",
        limitBytes: "5368709120",
        remainingBytes: "5368709120",
      });
    });

    it("returns 404 when the caller's user row no longer exists", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } } as never);

      const response = await request(httpServer).get(path).set(authHeader()).expect(404);

      expect((response.body as { message?: string }).message).toBe(USER_SERVICE_ERRORS.NOT_FOUND(TEST_USER_ID));
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(path).expect(401);
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
    const eventId = "66666666-6666-6666-6666-666666666666";

    beforeEach(() => {
      // The deletion runs inside an interactive transaction against the same mock client.
      prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.eventAccess.findMany.mockResolvedValue([]);
      prisma.eventAccess.count.mockResolvedValue(0);
      prisma.photo.findMany.mockResolvedValue([]);
      prisma.photo.deleteMany.mockResolvedValue({ count: 0 });
      prisma.photo.updateMany.mockResolvedValue({ count: 0 });
      prisma.deletedAccount.upsert.mockResolvedValue({} as never);
      prisma.user.delete.mockResolvedValue(buildUserWithDetails());
    });

    it("returns 204, tombstones the identity, keeps uploaded photos without an uploader, and deletes the row", async () => {
      prisma.photo.updateMany.mockResolvedValue({ count: 3 });

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      const providerSubHash = hashProviderSub(buildUserWithDetails().providerSub);
      expect(prisma.photo.updateMany).toHaveBeenCalledWith({
        where: { addedById: TEST_USER_ID },
        data: { addedById: null },
      });
      expect(prisma.deletedAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { providerSubHash }, create: { providerSubHash, userId: TEST_USER_ID } }),
      );
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: TEST_USER_ID } });
      // Nothing to purge: kept photos stay in S3, and there were no pending uploads.
      expect(s3Service.deleteObjects).not.toHaveBeenCalled();
    });

    it("returns 204 and removes uploaded photos everywhere with ?photos=delete", async () => {
      prisma.photo.findMany.mockImplementation(((args: { where: { status?: PhotoStatus } }) =>
        Promise.resolve(
          args.where.status === PhotoStatus.PENDING
            ? [{ s3Key: "photos/u/e/pending" }]
            : [{ s3Key: "photos/u/e/ready-1" }, { s3Key: "photos/u/e/ready-2" }],
        )) as never);
      prisma.photo.deleteMany.mockResolvedValue({ count: 2 });

      await request(httpServer).delete(path).query({ photos: "delete" }).set(authHeader()).expect(204);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { addedById: TEST_USER_ID, status: PhotoStatus.PENDING },
      });
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { addedById: TEST_USER_ID } });
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
      // Objects go only after the row is gone.
      expect(s3Service.deleteObjects).toHaveBeenCalledWith([
        "photos/u/e/pending",
        "photos/u/e/ready-1",
        "photos/u/e/ready-2",
      ]);
      expect(prisma.user.delete.mock.invocationCallOrder[0]).toBeLessThan(
        s3Service.deleteObjects.mock.invocationCallOrder[0],
      );
    });

    it("returns 204 and hands an event the caller organised alone to its longest-standing member", async () => {
      prisma.eventAccess.findMany.mockResolvedValue([{ eventId }] as never);
      prisma.eventAccess.count.mockImplementation(((args: { where: { accessLevel?: AccessLevel } }) =>
        Promise.resolve(args.where.accessLevel === AccessLevel.ORGANIZER ? 0 : 1)) as never);
      prisma.eventAccess.findFirst.mockResolvedValue({ id: "successor-access" } as never);
      prisma.eventAccess.update.mockResolvedValue({} as never);

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(prisma.eventAccess.findFirst).toHaveBeenCalledWith({
        where: { eventId, userId: { not: TEST_USER_ID } },
        orderBy: [{ accessLevel: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      expect(prisma.eventAccess.update).toHaveBeenCalledWith({
        where: { id: "successor-access" },
        data: { accessLevel: AccessLevel.ORGANIZER },
      });
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it("returns 204 and deletes an event nobody else is in, purging its photos", async () => {
      prisma.eventAccess.findMany.mockResolvedValue([{ eventId }] as never);
      prisma.eventAccess.findFirst.mockResolvedValue(null);
      prisma.photo.findMany.mockImplementation(((args: { where: { eventId?: string } }) =>
        Promise.resolve(
          args.where.eventId === eventId ? [{ s3Key: `photos/${TEST_OTHER_USER_ID}/${eventId}/x` }] : [],
        )) as never);
      prisma.event.delete.mockResolvedValue({} as never);

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
      expect(s3Service.deleteObjects).toHaveBeenCalledWith([`photos/${TEST_OTHER_USER_ID}/${eventId}/x`]);
    });

    it("returns 204 even when the S3 purge fails", async () => {
      prisma.photo.findMany.mockResolvedValue([{ s3Key: "photos/u/e/pending" }] as never);
      s3Service.deleteObjects.mockRejectedValue(new Error("s3 down"));

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(prisma.user.delete).toHaveBeenCalledTimes(1);
    });

    it("returns 204 when the account is already gone", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.deletedAccount.upsert).not.toHaveBeenCalled();
    });

    it("returns 400 for an unknown photos policy and deletes nothing", async () => {
      await request(httpServer).delete(path).query({ photos: "archive" }).set(authHeader()).expect(400);

      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("returns 401 when the access token is missing", async () => {
      const response = await request(httpServer).delete(path).expect(401);

      const body = response.body as ErrorResponse;
      expect(body.message).toBeDefined();
      expect(body.meta.path).toBe(path);
    });
  });
});
