import { INestApplication } from "@nestjs/common";
import { AccessLevel, PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { BLOCK_SERVICE_ERRORS } from "src/moderation/moderation.constants";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import request from "supertest";
import { TEST_TARGET_USER_ID, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import { buildTargetParticipantAccess } from "./helpers/events.fixtures";
import { buildBlock } from "./helpers/moderation.fixtures";
import { TEST_NOW, TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

const blocksPath = `/${API_GLOBAL_PREFIX}/users/me/blocks`;
const blockPath = (userId = TEST_TARGET_USER_ID) => `${blocksPath}/${userId}`;

type WrappedResponse<T> = {
  data: T;
  meta: { timestamp: string; path: string };
};

type ErrorResponse = {
  message?: string;
  meta: { timestamp: string; path: string };
};

type BlockedUserBody = { userId: string; name: string | null; username: string | null; blockedAt: string };

describe("Moderation (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;

  beforeAll(async () => {
    const context = await createTestApp((builder) => builder.overrideProvider(S3Service).useValue({}));
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

  describe("PUT /users/me/blocks/:userId", () => {
    beforeEach(() => {
      prisma.eventAccess.findFirst.mockResolvedValue(buildTargetParticipantAccess({ accessLevel: AccessLevel.VIEWER }));
      prisma.userBlock.createMany.mockResolvedValue({ count: 1 });
      prisma.userBlock.findUniqueOrThrow.mockResolvedValue(buildBlock());
    });

    it("returns 200 with the blocked user", async () => {
      const response = await request(httpServer).put(blockPath()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<BlockedUserBody>;
      expect(body.data).toEqual({
        userId: TEST_TARGET_USER_ID,
        name: "Target User",
        username: "target",
        blockedAt: TEST_NOW.toISOString(),
      });
      expect(prisma.userBlock.createMany).toHaveBeenCalledWith({
        data: [{ blockerId: TEST_USER_ID, blockedId: TEST_TARGET_USER_ID }],
        skipDuplicates: true,
      });
    });

    it("returns 200 again, not a conflict, when the user is already blocked", async () => {
      prisma.userBlock.createMany.mockResolvedValue({ count: 0 });

      await request(httpServer).put(blockPath()).set(authHeader()).expect(200);
    });

    it("returns 400 when the user id is not a UUID", async () => {
      await request(httpServer).put(blockPath("someone")).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).put(blockPath()).expect(401);
    });

    it("returns 403 when the caller blocks themselves", async () => {
      const response = await request(httpServer).put(blockPath(TEST_USER_ID)).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(BLOCK_SERVICE_ERRORS.CANNOT_BLOCK_SELF);
    });

    it("returns the same 404 for a user who shares no event with the caller as for one who does not exist", async () => {
      prisma.eventAccess.findFirst.mockResolvedValue(null);

      const response = await request(httpServer).put(blockPath()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.NOT_FOUND(TEST_TARGET_USER_ID));
      expect(prisma.userBlock.createMany).not.toHaveBeenCalled();
    });
  });

  describe("GET /users/me/blocks", () => {
    it("returns 200 with the users the caller has blocked", async () => {
      prisma.userBlock.findMany.mockResolvedValue([buildBlock()]);

      const response = await request(httpServer).get(blocksPath).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<{ items: BlockedUserBody[] }>;
      expect(body.data.items).toEqual([
        { userId: TEST_TARGET_USER_ID, name: "Target User", username: "target", blockedAt: TEST_NOW.toISOString() },
      ]);
      expect(prisma.userBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { blockerId: TEST_USER_ID } }),
      );
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(blocksPath).expect(401);
    });
  });

  describe("DELETE /users/me/blocks/:userId", () => {
    it("returns 204 and removes the caller's block", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 1 });

      await request(httpServer).delete(blockPath()).set(authHeader()).expect(204);

      expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
        where: { blockerId: TEST_USER_ID, blockedId: TEST_TARGET_USER_ID },
      });
    });

    it("returns 204 when the user was not blocked", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });

      await request(httpServer).delete(blockPath()).set(authHeader()).expect(204);
    });

    it("returns 400 when the user id is not a UUID", async () => {
      await request(httpServer).delete(blockPath("someone")).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).delete(blockPath()).expect(401);
    });
  });
});
