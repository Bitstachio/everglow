import { Event } from "generated/prisma/client";
import { EventParticipantResponseDto } from "../dto/event-participant-response.dto";
import { EventResponseDto } from "../dto/event-response.dto";
import { buildInvitationUrl } from "../events.invitation";
import { EventParticipant } from "../events.types";

export class EventMapper {
  /** `coverUrl` is presigned by the caller; the mapper never sees S3, and the key is never returned. */
  static toResponseDto(event: Event, coverUrl: string | null): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      creatorId: event.creatorId,
      invitationUrl: buildInvitationUrl(event.invitationUrl),
      coverUrl,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  static toParticipantResponseDto(participant: EventParticipant): EventParticipantResponseDto {
    return {
      userId: participant.userId,
      name: participant.name,
      accessLevel: participant.accessLevel,
      avatarUrl: participant.avatarUrl,
    };
  }

  static toParticipantResponseDtoList(participants: EventParticipant[]): EventParticipantResponseDto[] {
    return participants.map((participant) => EventMapper.toParticipantResponseDto(participant));
  }
}
