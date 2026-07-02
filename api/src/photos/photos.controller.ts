import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { CreateUploadUrlsDto } from "./dto/create-upload-urls.dto";
import { UploadSlotResponseDto } from "./dto/upload-slot-response.dto";
import { PhotosService } from "./photos.service";

@ApiTags("photos")
@ApiBearerAuth("access-token")
@Controller()
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Post("galleries/:galleryId/photos/upload-urls")
  @ApiOperation({ summary: "Mint presigned upload URLs for a batch of photos" })
  @ApiWrappedResponse(UploadSlotResponseDto, "Upload slots with presigned S3 PUT URLs", 201)
  async createUploadUrls(
    @CurrentUser() user: AuthenticatedUser,
    @Param("galleryId", ParseUUIDPipe) galleryId: string,
    @Body() dto: CreateUploadUrlsDto,
  ): Promise<UploadSlotResponseDto[]> {
    return this.photosService.createUploadSlots(galleryId, user.id, dto.files);
  }
}
