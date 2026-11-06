import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { AllowSuspended } from "src/auth/allow-suspended.decorator";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { DevicesService } from "./devices.service";
import { DeviceResponseDto } from "./dto/device-response.dto";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { DeviceMapper } from "./mappers/device.mapper";

@ApiTags("notifications")
@ApiBearerAuth("access-token")
@Controller("users/me/devices")
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Put()
  @AllowSuspended()
  @ApiOperation({
    summary: "Register this phone for push notifications",
    description:
      "Call on every launch while signed in, and whenever the push token changes. Idempotent per token. A token " +
      "registered to another account moves to the caller. Each account keeps its 10 most recently seen phones.",
  })
  @ApiWrappedResponse(DeviceResponseDto, "The registered phone")
  async register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto): Promise<DeviceResponseDto> {
    return DeviceMapper.toResponseDto(await this.devicesService.register(user.id, dto));
  }

  @Delete(":deviceId")
  @AllowSuspended()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Stop push notifications to a phone",
    description: "Call on sign-out, before the access token is cleared. Idempotent: an unknown id is not an error.",
  })
  @ApiNoContentResponse({ description: "The phone gets no more pushes (empty data envelope at runtime)" })
  async unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId", ParseUUIDPipe) deviceId: string,
  ): Promise<void> {
    return this.devicesService.unregister(user.id, deviceId);
  }
}
