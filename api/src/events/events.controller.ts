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
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { CreateEventDto } from "./dto/create-event.dto";
import { EventParticipantResponseDto } from "./dto/event-participant-response.dto";
import { EventResponseDto } from "./dto/event-response.dto";
import { JoinEventDto } from "./dto/join-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { UpdateParticipantAccessDto } from "./dto/update-participant-access.dto";
import { extractInvitationToken } from "./events.invitation";
import { EventsService } from "./events.service";
import { EventMapper } from "./mappers/event.mapper";

@ApiTags("events")
@ApiBearerAuth("access-token")
@Controller("events")
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: "Create an event" })
  @ApiWrappedResponse(EventResponseDto, "Created event", 201)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto): Promise<EventResponseDto> {
    return EventMapper.toResponseDto(await this.eventsService.create(user.id, dto));
  }

  @Get()
  @ApiOperation({ summary: "List events for the current user" })
  @ApiWrappedResponse(EventResponseDto, "Events the user can read", 200)
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<EventResponseDto[]> {
    return EventMapper.toResponseDtoList(await this.eventsService.findAllForUser(user.id));
  }

  @Post("join")
  @ApiOperation({ summary: "Join an event via invitation URL" })
  @ApiWrappedResponse(EventResponseDto, "Joined event")
  async join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinEventDto): Promise<EventResponseDto> {
    const invitationToken = extractInvitationToken(dto.invitationUrl);
    return EventMapper.toResponseDto(await this.eventsService.joinByInvitationUrl(user.id, invitationToken));
  }

  @Get(":eventId")
  @ApiOperation({ summary: "Get an event by ID" })
  @ApiWrappedResponse(EventResponseDto, "Event details")
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<EventResponseDto> {
    return EventMapper.toResponseDto(await this.eventsService.findOne(eventId, user.id));
  }

  @Patch(":eventId")
  @ApiOperation({ summary: "Update an event" })
  @ApiWrappedResponse(EventResponseDto, "Updated event")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ): Promise<EventResponseDto> {
    return EventMapper.toResponseDto(await this.eventsService.update(eventId, user.id, dto));
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
  @ApiOperation({ summary: "Regenerate the event invitation URL" })
  @ApiWrappedResponse(EventResponseDto, "Event with new invitation URL")
  async regenerateInvitationUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<EventResponseDto> {
    return EventMapper.toResponseDto(await this.eventsService.regenerateInvitationUrl(eventId, user.id));
  }
}
