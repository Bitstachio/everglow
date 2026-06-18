import { Event } from "generated/prisma/client";
import { EventParticipantResponseDto } from "../dto/event-participant-response.dto";
import { EventResponseDto } from "../dto/event-response.dto";
import { buildInvitationUrl } from "../events.invitation";
import { EventParticipant } from "../events.types";

export class EventMapper {
  static toResponseDto(event: Event): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      creatorId: event.creatorId,
      invitationUrl: buildInvitationUrl(event.invitationUrl),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  static toResponseDtoList(events: Event[]): EventResponseDto[] {
    return events.map((event) => EventMapper.toResponseDto(event));
  }

  static toParticipantResponseDto(participant: EventParticipant): EventParticipantResponseDto {
    return {
      userId: participant.userId,
      name: participant.name,
      accessLevel: participant.accessLevel,
    };
  }

  static toParticipantResponseDtoList(participants: EventParticipant[]): EventParticipantResponseDto[] {
    return participants.map((participant) => EventMapper.toParticipantResponseDto(participant));
  }
}
