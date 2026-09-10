import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { ConfirmPhotoResultDto } from "./dto/confirm-photo-result.dto";
import { ConfirmUploadsDto } from "./dto/confirm-uploads.dto";
import { CreateUploadUrlsDto } from "./dto/create-upload-urls.dto";
import { InitiateMultipartUploadDto } from "./dto/initiate-multipart-upload.dto";
import { ListPhotosQueryDto } from "./dto/list-photos-query.dto";
import { MultipartUploadResponseDto } from "./dto/multipart-upload-response.dto";
import { PhotoListResponseDto } from "./dto/photo-list-response.dto";
import { PhotoResponseDto } from "./dto/photo-response.dto";
import { UploadSlotResponseDto } from "./dto/upload-slot-response.dto";
import { PhotoMapper } from "./mappers/photo.mapper";
import { PhotoMultipartService } from "./photo-multipart.service";
import { PhotosService } from "./photos.service";

@ApiTags("photos")
@ApiBearerAuth("access-token")
@Controller()
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class PhotosController {
  constructor(
    private readonly photosService: PhotosService,
    private readonly photoMultipartService: PhotoMultipartService,
  ) {}

  @Post("events/:eventId/photos/upload-urls")
  @ApiOperation({ summary: "Mint presigned upload URLs for a batch of photos" })
  @ApiWrappedResponse(UploadSlotResponseDto, "Upload slots with presigned S3 PUT URLs", 201)
  async createUploadUrls(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: CreateUploadUrlsDto,
  ): Promise<UploadSlotResponseDto[]> {
    return this.photosService.createUploadSlots(eventId, user.id, dto.files);
  }

  @Post("events/:eventId/photos/confirm")
  @ApiOperation({ summary: "Confirm uploaded photos and mark them ready" })
  @ApiWrappedResponse(ConfirmPhotoResultDto, "Per-photo verification result", 201)
  async confirmUploads(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: ConfirmUploadsDto,
  ): Promise<ConfirmPhotoResultDto[]> {
    return this.photosService.confirmUploads(eventId, user.id, dto.photoIds);
  }

  @Post("events/:eventId/photos/multipart-uploads")
  @ApiOperation({ summary: "Start a multipart upload for one photo of at least 5 MiB" })
  @ApiWrappedResponse(MultipartUploadResponseDto, "Upload layout with a presigned PUT URL per part", 201)
  async createMultipartUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: InitiateMultipartUploadDto,
  ): Promise<MultipartUploadResponseDto> {
    return this.photoMultipartService.initiate(eventId, user.id, dto);
  }

  @Get("photos/:photoId/multipart-upload")
  @ApiOperation({ summary: "Get the state of a multipart upload, with fresh part URLs" })
  @ApiWrappedResponse(MultipartUploadResponseDto, "Which parts S3 already holds, plus a presigned PUT URL per part")
  async getMultipartUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("photoId", ParseUUIDPipe) photoId: string,
  ): Promise<MultipartUploadResponseDto> {
    return this.photoMultipartService.getState(photoId, user.id);
  }

  @Post("photos/:photoId/multipart-upload/complete")
  @ApiOperation({ summary: "Assemble an uploaded multipart photo and mark it ready" })
  @ApiWrappedResponse(ConfirmPhotoResultDto, "Verification result for the assembled photo", 201)
  async completeMultipartUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("photoId", ParseUUIDPipe) photoId: string,
  ): Promise<ConfirmPhotoResultDto> {
    return this.photoMultipartService.complete(photoId, user.id);
  }

  @Get("events/:eventId/photos")
  @ApiOperation({ summary: "List ready photos in an event (cursor-paginated)" })
  @ApiWrappedResponse(PhotoListResponseDto, "Photos with presigned download URLs, newest first")
  async listPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Query() query: ListPhotosQueryDto,
  ): Promise<PhotoListResponseDto> {
    const page = await this.photosService.listPhotos(eventId, user.id, query);
    return PhotoMapper.toListResponseDto(page.items, page.nextCursor);
  }

  @Get("photos/:photoId")
  @ApiOperation({ summary: "Get a photo by ID" })
  @ApiWrappedResponse(PhotoResponseDto, "Photo with presigned download URL")
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("photoId", ParseUUIDPipe) photoId: string,
  ): Promise<PhotoResponseDto> {
    return PhotoMapper.toResponseDto(await this.photosService.findOne(photoId, user.id));
  }

  @Delete("photos/:photoId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a photo" })
  @ApiNoContentResponse({ description: "Photo deleted (empty data envelope at runtime)" })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("photoId", ParseUUIDPipe) photoId: string,
  ): Promise<void> {
    return this.photosService.deletePhoto(photoId, user.id);
  }
}
