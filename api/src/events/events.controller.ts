import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { Event } from "generated/prisma/client";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RateLimit } from "src/common/rate-limit/rate-limit.decorator";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { ConfirmImageUploadDto } from "src/images/dto/confirm-image-upload.dto";
import { CreateImageUploadDto } from "src/images/dto/create-image-upload.dto";
import { ImageUploadResponseDto } from "src/images/dto/image-upload-response.dto";
import { CreateEventDto } from "./dto/create-event.dto";
import { EventParticipantResponseDto } from "./dto/event-participant-response.dto";
import { EventResponseDto } from "./dto/event-response.dto";
import { JoinEventDto } from "./dto/join-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { UpdateParticipantAccessDto } from "./dto/update-participant-access.dto";
import { EventCoverService } from "./event-cover.service";
import { extractInvitationToken } from "./events.invitation";
import { EventsService } from "./events.service";
import { EventMapper } from "./mappers/event.mapper";

@ApiTags("events")
@ApiBearerAuth("access-token")
@Controller("events")
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventCoverService: EventCoverService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create an event" })
  @ApiWrappedResponse(EventResponseDto, "Created event", 201)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto): Promise<EventResponseDto> {
    return this.toResponseDto(await this.eventsService.create(user.id, dto));
  }

  @Get()
  @ApiOperation({ summary: "List events for the current user" })
  @ApiWrappedResponse(EventResponseDto, "Events the user can read", 200)
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<EventResponseDto[]> {
    return Promise.all((await this.eventsService.findAllForUser(user.id)).map((event) => this.toResponseDto(event)));
  }

  @Post("join")
  @RateLimit("sensitive")
  @ApiOperation({ summary: "Join an event via invitation URL" })
  @ApiWrappedResponse(EventResponseDto, "Joined event")
  async join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinEventDto): Promise<EventResponseDto> {
    const invitationToken = extractInvitationToken(dto.invitationUrl);
    return this.toResponseDto(await this.eventsService.joinByInvitationUrl(user.id, invitationToken));
  }

  @Get(":eventId")
  @ApiOperation({ summary: "Get an event by ID" })
  @ApiWrappedResponse(EventResponseDto, "Event details")
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<EventResponseDto> {
    return this.toResponseDto(await this.eventsService.findOne(eventId, user.id));
  }

  @Patch(":eventId")
  @ApiOperation({ summary: "Update an event" })
  @ApiWrappedResponse(EventResponseDto, "Updated event")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ): Promise<EventResponseDto> {
    return this.toResponseDto(await this.eventsService.update(eventId, user.id, dto));
  }

  @Delete(":eventId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an event" })
  @ApiNoContentResponse({ description: "Event deleted (empty data envelope at runtime)" })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    return this.eventsService.delete(eventId, user.id);
  }

  @Post(":eventId/leave")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Leave an event" })
  @ApiNoContentResponse({ description: "Caller left the event (empty data envelope at runtime)" })
  async leave(@CurrentUser() user: AuthenticatedUser, @Param("eventId", ParseUUIDPipe) eventId: string): Promise<void> {
    return this.eventsService.leaveEvent(eventId, user.id);
  }

  @Get(":eventId/participants")
  @ApiOperation({ summary: "List event participants" })
  @ApiWrappedResponse(EventParticipantResponseDto, "Event participants")
  async getParticipants(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<EventParticipantResponseDto[]> {
    return EventMapper.toParticipantResponseDtoList(await this.eventsService.getEventParticipants(eventId, user.id));
  }

  @Put(":eventId/participants/:targetUserId/access")
  @ApiOperation({ summary: "Update a member access level" })
  @ApiWrappedResponse(EventParticipantResponseDto, "Updated member")
  async updateParticipantAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("targetUserId", ParseUUIDPipe) targetUserId: string,
    @Body() dto: UpdateParticipantAccessDto,
  ): Promise<EventParticipantResponseDto> {
    return EventMapper.toParticipantResponseDto(
      await this.eventsService.updateUserAccessLevel(eventId, user.id, targetUserId, dto.accessLevel),
    );
  }

  @Delete(":eventId/participants/:targetUserId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a member from an event" })
  @ApiNoContentResponse({ description: "Member removed (empty data envelope at runtime)" })
  async removeParticipant(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("targetUserId", ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    return this.eventsService.removeUserFromEvent(eventId, user.id, targetUserId);
  }

  @Post(":eventId/regenerate-url")
  @RateLimit("sensitive")
  @ApiOperation({ summary: "Regenerate the event invitation URL" })
  @ApiWrappedResponse(EventResponseDto, "Event with new invitation URL")
  async regenerateInvitationUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<EventResponseDto> {
    return this.toResponseDto(await this.eventsService.regenerateInvitationUrl(eventId, user.id));
  }

  @Post(":eventId/cover/upload-url")
  @RateLimit("uploads")
  @ApiOperation({ summary: "Mint a presigned upload URL for the event cover image" })
  @ApiWrappedResponse(ImageUploadResponseDto, "Upload id with a presigned S3 PUT URL", 201)
  async createCoverUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: CreateImageUploadDto,
  ): Promise<ImageUploadResponseDto> {
    return this.eventCoverService.createUpload(eventId, user.id, dto);
  }

  @Put(":eventId/cover")
  @ApiOperation({ summary: "Confirm an uploaded cover image and set it on the event" })
  @ApiWrappedResponse(EventResponseDto, "Event with the new cover")
  async confirmCoverUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: ConfirmImageUploadDto,
  ): Promise<EventResponseDto> {
    return this.toResponseDto(await this.eventCoverService.confirmUpload(eventId, user.id, dto.uploadId));
  }

  @Delete(":eventId/cover")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove the event cover image" })
  @ApiNoContentResponse({ description: "Cover removed (empty data envelope at runtime)" })
  async removeCover(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    return this.eventCoverService.remove(eventId, user.id);
  }

  private async toResponseDto(event: Event): Promise<EventResponseDto> {
    return EventMapper.toResponseDto(event, await this.eventCoverService.getCoverUrl(event));
  }
}
