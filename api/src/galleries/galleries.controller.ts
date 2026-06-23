import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { GalleryResponseDto } from "./dto/gallery-response.dto";
import { GalleriesService } from "./galleries.service";
import { GalleryMapper } from "./mappers/gallery.mapper";

// [DECISION][Barbod]: do we need POST/PATCH/DELETE for galleries in v1?
@ApiTags("galleries")
@ApiBearerAuth("access-token")
@Controller()
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class GalleriesController {
  constructor(private readonly galleriesService: GalleriesService) {}

  @Get("events/:eventId/galleries")
  @ApiOperation({ summary: "List galleries for an event" })
  @ApiWrappedResponse(GalleryResponseDto, "Galleries the user can read in the event", 200)
  async findAllForEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<GalleryResponseDto[]> {
    return GalleryMapper.toResponseDtoList(await this.galleriesService.findAllForEvent(eventId, user.id));
  }

  @Get("galleries/:galleryId")
  @ApiOperation({ summary: "Get a gallery by ID" })
  @ApiWrappedResponse(GalleryResponseDto, "Gallery details")
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("galleryId", ParseUUIDPipe) galleryId: string,
  ): Promise<GalleryResponseDto> {
    return GalleryMapper.toResponseDto(await this.galleriesService.findOne(galleryId, user.id));
  }
}
