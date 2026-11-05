import { Test, TestingModule } from "@nestjs/testing";
import { DevicePlatform, PrismaClient, UserDevice } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { DevicesService } from "./devices.service";
import { MAX_DEVICES_PER_USER } from "./notifications.constants";

describe("DevicesService", () => {
  let service: DevicesService;
  let prisma: DeepMockProxy<PrismaClient>;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const deviceId = "33333333-3333-4333-8333-333333333333";
  const token = "ExponentPushToken[abc123]";
  const now = new Date("2026-11-05T12:00:00.000Z");

  const device = (overrides: Partial<UserDevice> = {}): UserDevice => ({
    id: deviceId,
    userId,
    token,
    platform: DevicePlatform.IOS,
    locale: "en-CA",
    createdAt: now,
    lastSeenAt: now,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    service = module.get(DevicesService);

    prisma.userDevice.findUnique.mockResolvedValue(null);
    prisma.userDevice.upsert.mockResolvedValue(device());
    prisma.userDevice.findMany.mockResolvedValue([]);
  });

  describe("register", () => {
    const dto = { token, platform: DevicePlatform.IOS, locale: "en-CA" };

    it("upserts the token for the caller and logs a new registration without the token", async () => {
      const result = await service.register(userId, dto);

      expect(result).toEqual(device());
      expect(prisma.userDevice.upsert).toHaveBeenCalledWith({
        where: { token },
        create: { userId, token, platform: DevicePlatform.IOS, locale: "en-CA" },
        update: { userId, platform: DevicePlatform.IOS, locale: "en-CA", lastSeenAt: expect.any(Date) as Date },
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.device.registered", userId, deviceId, movedFromOtherAccount: false }),
        expect.any(String),
      );
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain(token);
    });

    it("stores a missing locale as null", async () => {
      await service.register(userId, { token, platform: DevicePlatform.ANDROID });

      expect(prisma.userDevice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ locale: null }) as object }),
      );
    });

    it("moves a token registered to another account to the caller", async () => {
      prisma.userDevice.findUnique.mockResolvedValue(device({ userId: otherUserId }));

      await service.register(userId, dto);

      expect(prisma.userDevice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ userId }) as object }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.device.registered", movedFromOtherAccount: true }),
        expect.any(String),
      );
    });

    it("does not log again when the caller's own phone registers on launch", async () => {
      prisma.userDevice.findUnique.mockResolvedValue(device());

      await service.register(userId, dto);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it(`keeps only the ${MAX_DEVICES_PER_USER} phones seen most recently`, async () => {
      prisma.userDevice.findMany.mockResolvedValue([{ id: "old-1" }, { id: "old-2" }] as UserDevice[]);

      await service.register(userId, dto);

      expect(prisma.userDevice.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { lastSeenAt: "desc" },
        skip: MAX_DEVICES_PER_USER,
        select: { id: true },
      });
      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["old-1", "old-2"] } } });
    });

    it("deletes nothing while the caller is under the cap", async () => {
      await service.register(userId, dto);

      expect(prisma.userDevice.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("unregister", () => {
    it("deletes only the caller's own device", async () => {
      prisma.userDevice.deleteMany.mockResolvedValue({ count: 1 });

      await service.unregister(userId, deviceId);

      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { id: deviceId, userId } });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.device.unregistered", userId, deviceId }),
        expect.any(String),
      );
    });

    it("is a silent no-op for a device that is gone or not the caller's", async () => {
      prisma.userDevice.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unregister(userId, deviceId)).resolves.toBeUndefined();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
