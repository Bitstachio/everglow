import { INestApplication } from "@nestjs/common";
import { DevicePlatform, PrismaClient, UserDevice } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import { TEST_NOW, TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

const devicesPath = `/${API_GLOBAL_PREFIX}/users/me/devices`;
const TEST_DEVICE_ID = "77777777-7777-4777-8777-777777777777";
const TEST_PUSH_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

type WrappedResponse<T> = { data: T; meta: { timestamp: string; path: string } };

const buildDevice = (overrides: Partial<UserDevice> = {}): UserDevice => ({
  id: TEST_DEVICE_ID,
  userId: TEST_USER_ID,
  token: TEST_PUSH_TOKEN,
  platform: DevicePlatform.IOS,
  locale: "en-CA",
  createdAt: TEST_NOW,
  lastSeenAt: TEST_NOW,
  ...overrides,
});

describe("Devices (integration)", () => {
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
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.userDevice.findUnique.mockResolvedValue(null);
    prisma.userDevice.upsert.mockResolvedValue(buildDevice());
    prisma.userDevice.findMany.mockResolvedValue([]);
  });

  describe("PUT /users/me/devices", () => {
    const put = (body: object) => request(httpServer).put(devicesPath).set(authHeader()).send(body);

    it("returns 200 with the device and never echoes the token", async () => {
      const response = await put({ token: TEST_PUSH_TOKEN, platform: "IOS", locale: "en-CA" }).expect(200);

      const body = response.body as WrappedResponse<Record<string, unknown>>;
      expect(body.data).toEqual({
        id: TEST_DEVICE_ID,
        platform: "IOS",
        locale: "en-CA",
        lastSeenAt: TEST_NOW.toISOString(),
      });
      expect(JSON.stringify(body)).not.toContain(TEST_PUSH_TOKEN);
      expect(prisma.userDevice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: TEST_PUSH_TOKEN } }),
      );
    });

    it("accepts a registration without a locale", async () => {
      await put({ token: TEST_PUSH_TOKEN, platform: "ANDROID" }).expect(200);
    });

    it.each([
      ["a raw APNs token", { token: "a1b2c3d4e5f6", platform: "IOS" }],
      ["an unknown platform", { token: TEST_PUSH_TOKEN, platform: "WEB" }],
      ["a malformed locale", { token: TEST_PUSH_TOKEN, platform: "IOS", locale: "english please" }],
      ["no token", { platform: "IOS" }],
    ])("returns 400 for %s", async (_label, body) => {
      await put(body).expect(400);
      expect(prisma.userDevice.upsert).not.toHaveBeenCalled();
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).put(devicesPath).send({ token: TEST_PUSH_TOKEN, platform: "IOS" }).expect(401);
    });

    it("lets a suspended account register, so account notices can still reach it", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithDetails({ suspendedAt: TEST_NOW }));

      await put({ token: TEST_PUSH_TOKEN, platform: "IOS" }).expect(200);
    });
  });

  describe("DELETE /users/me/devices/:deviceId", () => {
    it("returns 204 and deletes only the caller's device", async () => {
      prisma.userDevice.deleteMany.mockResolvedValue({ count: 1 });

      await request(httpServer).delete(`${devicesPath}/${TEST_DEVICE_ID}`).set(authHeader()).expect(204);

      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({
        where: { id: TEST_DEVICE_ID, userId: TEST_USER_ID },
      });
    });

    it("returns 204 for a device that is already gone", async () => {
      prisma.userDevice.deleteMany.mockResolvedValue({ count: 0 });

      await request(httpServer).delete(`${devicesPath}/${TEST_DEVICE_ID}`).set(authHeader()).expect(204);
    });

    it("returns 400 when the id is not a UUID", async () => {
      await request(httpServer).delete(`${devicesPath}/not-a-uuid`).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).delete(`${devicesPath}/${TEST_DEVICE_ID}`).expect(401);
    });
  });
});
