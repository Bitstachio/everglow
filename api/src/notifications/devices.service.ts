import { Injectable } from "@nestjs/common";
import { UserDevice } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { MAX_DEVICES_PER_USER } from "./notifications.constants";

/**
 * The phones an account receives pushes on (docs/notifications.md §2). The
 * app registers on every launch while signed in and unregisters on sign-out.
 * Tokens are never logged: whoever holds one can address the phone.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Idempotent. A token already registered to someone else moves to the
   * caller: the phone is signed in to the caller's account now, and pushes
   * for the previous account must stop reaching it.
   */
  async register(userId: string, dto: RegisterDeviceDto): Promise<UserDevice> {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.userDevice.findUnique({
        where: { token: dto.token },
        select: { id: true, userId: true },
      });
      const device = await tx.userDevice.upsert({
        where: { token: dto.token },
        create: { userId, token: dto.token, platform: dto.platform, locale: dto.locale ?? null },
        update: { userId, platform: dto.platform, locale: dto.locale ?? null, lastSeenAt: new Date() },
      });

      // Keep the newest MAX_DEVICES_PER_USER; the rest are phones not opened in a while.
      const surplus = await tx.userDevice.findMany({
        where: { userId },
        orderBy: { lastSeenAt: "desc" },
        skip: MAX_DEVICES_PER_USER,
        select: { id: true },
      });
      if (surplus.length > 0) {
        await tx.userDevice.deleteMany({ where: { id: { in: surplus.map((row) => row.id) } } });
      }

      if (!previous || previous.userId !== userId) {
        this.logger.info(
          {
            event: "user.device.registered",
            userId,
            deviceId: device.id,
            platform: device.platform,
            movedFromOtherAccount: previous !== null,
            pruned: surplus.length,
          },
          "Device registered for push notifications",
        );
      }
      return device;
    });
  }

  /** Idempotent: a device that is gone, or is not the caller's, is a no-op. */
  async unregister(userId: string, deviceId: string): Promise<void> {
    const { count } = await this.prisma.userDevice.deleteMany({ where: { id: deviceId, userId } });
    if (count > 0) {
      this.logger.info({ event: "user.device.unregistered", userId, deviceId }, "Device unregistered");
    }
  }
}
