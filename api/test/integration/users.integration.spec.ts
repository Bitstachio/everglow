import { INestApplication, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AccountDeletionPhotoPolicy, PhotoStatus, PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockDeep, mockReset } from "jest-mock-extended";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { hashProviderSub } from "src/users/deleted-provider-sub";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { UsersService } from "src/users/users.service";
import { userWithDetailsInclude } from "src/users/users.types";
import request from "supertest";
import { authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_NOW,
  TEST_PROVIDER_SUB,
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

describe("UsersController (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let auth0Management: DeepMockProxy<Auth0ManagementService>;
  let usersService: UsersService;
  let httpServer: Server;

  const s3Service = { deleteObjects: jest.fn() };

  beforeAll(async () => {
    auth0Management = mockDeep<Auth0ManagementService>();
    const context = await createTestApp((builder) =>
      builder
        .overrideProvider(Auth0ManagementService)
        .useValue(auth0Management)
        .overrideProvider(S3Service)
        .useValue(s3Service),
    );
    app = context.app;
    prisma = context.prisma;
    usersService = app.get(UsersService);
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // mockReset (unlike jest.clearAllMocks) also removes mockResolvedValue
    // implementations, preventing stubs from leaking between tests
    mockReset(prisma);
    mockReset(auth0Management);
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    // Prep sweeps events and photos before the Auth0 call; an account with
    // nothing to settle is the default for these cases.
    prisma.eventAccess.findMany.mockResolvedValue([]);
    prisma.photo.findMany.mockResolvedValue([]);
    prisma.photo.deleteMany.mockResolvedValue({ count: 0 });
    prisma.photo.updateMany.mockResolvedValue({ count: 0 });
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

    it("returns 204 when the account deletion saga completes and writes a tombstone", async () => {
      const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
      const auth0DeletedAt = new Date("2026-06-10T12:02:00.000Z");
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockResolvedValue({
        providerSubHash: hashProviderSub(TEST_PROVIDER_SUB),
        formerUserId: TEST_USER_ID,
        deletedAt: TEST_NOW,
      });
      prisma.user.delete.mockResolvedValue(buildUserWithDetails());

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(auth0Management.deleteUser).toHaveBeenCalledWith(TEST_PROVIDER_SUB);
      // Two transactions: prep, then the tombstone with the row delete.
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalledWith({
        where: { providerSubHash: hashProviderSub(TEST_PROVIDER_SUB) },
        create: { providerSubHash: hashProviderSub(TEST_PROVIDER_SUB), formerUserId: TEST_USER_ID },
        update: { formerUserId: TEST_USER_ID, deletedAt: expect.any(Date) as Date },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: TEST_USER_ID } });
      expect(prisma.deletedProviderSub.upsert.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.delete.mock.invocationCallOrder[0],
      );
    });

    it("stamps the default photo policy with the intent and keeps uploaded photos", async () => {
      const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
      const auth0DeletedAt = new Date("2026-06-10T12:02:00.000Z");
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      prisma.photo.updateMany.mockResolvedValue({ count: 3 });
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(buildUserWithDetails());

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: TEST_USER_ID },
        data: { deletionStartedAt: expect.any(Date) as Date, deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP },
        select: { deletionStartedAt: true },
      });
      expect(prisma.photo.updateMany).toHaveBeenCalledWith({
        where: { addedById: TEST_USER_ID },
        data: { addedById: null },
      });
    });

    it("removes uploaded photos and purges their objects with ?photos=DELETE", async () => {
      const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
      const auth0DeletedAt = new Date("2026-06-10T12:02:00.000Z");
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      prisma.photo.findMany.mockImplementation(((args: { where: { status?: PhotoStatus } }) =>
        Promise.resolve(
          args.where.status === PhotoStatus.PENDING
            ? [{ s3Key: "photos/u/e/pending" }]
            : [{ s3Key: "photos/u/e/ready" }],
        )) as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(buildUserWithDetails());

      await request(httpServer)
        .delete(path)
        .query({ photos: AccountDeletionPhotoPolicy.DELETE })
        .set(authHeader())
        .expect(204);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { addedById: TEST_USER_ID } });
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
      // Objects go only once the rows are gone.
      expect(s3Service.deleteObjects).toHaveBeenCalledWith(["photos/u/e/pending", "photos/u/e/ready"]);
      expect(prisma.user.delete.mock.invocationCallOrder[0]).toBeLessThan(
        s3Service.deleteObjects.mock.invocationCallOrder[0],
      );
    });

    it("still returns 204 when the S3 purge fails", async () => {
      const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
      const auth0DeletedAt = new Date("2026-06-10T12:02:00.000Z");
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      prisma.photo.findMany.mockResolvedValue([{ s3Key: "photos/u/e/pending" }] as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.user.delete.mockResolvedValue(buildUserWithDetails());
      s3Service.deleteObjects.mockRejectedValue(new Error("s3 down"));

      await request(httpServer).delete(path).set(authHeader()).expect(204);

      expect(prisma.user.delete).toHaveBeenCalledTimes(1);
    });

    it("returns 400 for an unknown photo policy and touches nothing", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());

      await request(httpServer).delete(path).query({ photos: "archive" }).set(authHeader()).expect(400);

      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("returns 500 and leaves the database row when Auth0 deletion fails after intent is stamped", async () => {
      const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.user.update.mockResolvedValueOnce({ deletionStartedAt } as never);
      auth0Management.deleteUser.mockRejectedValue(
        new InternalServerErrorException(`Failed to delete Auth0 user "${TEST_PROVIDER_SUB}"`),
      );

      await request(httpServer).delete(path).set(authHeader()).expect(500);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      // Prep has its own transaction; what must not happen is the tombstone.
      expect(prisma.deletedProviderSub.upsert).not.toHaveBeenCalled();
      expect(prisma.deletedProviderSub.upsert).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("returns 500 and does not delete the user when tombstone write fails", async () => {
      const deletionStartedAt = new Date("2026-06-10T12:01:00.000Z");
      const auth0DeletedAt = new Date("2026-06-10T12:02:00.000Z");
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
      prisma.user.update
        .mockResolvedValueOnce({ deletionStartedAt } as never)
        .mockResolvedValueOnce({ auth0DeletedAt } as never);
      auth0Management.deleteUser.mockResolvedValue(undefined);
      prisma.deletedProviderSub.upsert.mockRejectedValue(new Error("Tombstone write failed"));

      await request(httpServer).delete(path).set(authHeader()).expect(500);

      expect(prisma.deletedProviderSub.upsert).toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
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
      expect(auth0Management.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });

  describe("resolveByProviderSub (wired UsersService)", () => {
    // HTTP integration stubs JwtAuthGuard, so resurrection is asserted through
    // the real UsersService resolved from the Nest container with mocked Prisma.

    it("JIT-provisions a first-time providerSub", async () => {
      const provisioned = buildUserWithoutDetails();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(provisioned);

      const result = await usersService.resolveByProviderSub(TEST_PROVIDER_SUB);

      expect(result).toEqual(provisioned);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { providerSub: TEST_PROVIDER_SUB },
        include: userWithDetailsInclude,
      });
    });

    it("rejects a tombstoned providerSub so a lingering token cannot resurrect the account", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.deletedProviderSub.findUnique.mockResolvedValue({
        providerSubHash: hashProviderSub(TEST_PROVIDER_SUB),
        formerUserId: TEST_USER_ID,
        deletedAt: TEST_NOW,
      });

      await expect(usersService.resolveByProviderSub(TEST_PROVIDER_SUB)).rejects.toThrow(new UnauthorizedException());
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects a mid-deletion user that still has a database row", async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUserWithDetails({
          deletionStartedAt: new Date("2026-06-10T12:01:00.000Z"),
        }),
      );

      await expect(usersService.resolveByProviderSub(TEST_PROVIDER_SUB)).rejects.toThrow(new UnauthorizedException());
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("still resolves an active user after an unrelated providerSub was tombstoned", async () => {
      const active = buildUserWithDetails();
      prisma.user.findUnique.mockResolvedValue(active);

      const result = await usersService.resolveByProviderSub(TEST_PROVIDER_SUB);

      expect(result).toEqual(active);
      expect(prisma.deletedProviderSub.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
