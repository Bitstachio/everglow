import { UserDevice } from "generated/prisma/client";
import { DeviceResponseDto } from "../dto/device-response.dto";

export class DeviceMapper {
  static toResponseDto(device: UserDevice): DeviceResponseDto {
    return { id: device.id, platform: device.platform, locale: device.locale, lastSeenAt: device.lastSeenAt };
  }
}
