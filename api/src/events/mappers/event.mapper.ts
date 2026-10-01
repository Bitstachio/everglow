import { Event, EventInvite } from "generated/prisma/client";
import { EventBanListResponseDto } from "../dto/event-ban-list-response.dto";
import { EventBanResponseDto } from "../dto/event-ban-response.dto";
import { EventInviteResponseDto } from "../dto/event-invite-response.dto";
import { EventParticipantResponseDto } from "../dto/event-participant-response.dto";
import { EventResponseDto } from "../dto/event-response.dto";
import { EVENT_STATUSES } from "../events.constants";
import { buildInvitationUrl } from "../events.invitation";
import { EventBanWithUser, EventParticipant } from "../events.types";

const INVITE_SORT_ORDER: Record<string, number> = {
  PARTICIPANT: 0,
  VIEWER: 1,
  ORGANIZER: 2,
};

export class EventMapper {
  /** `coverUrl` is presigned by the caller; the mapper never sees S3, and the key is never returned. */
  static toResponseDto(event: Event, coverUrl: string | null, invites: EventInvite[] = []): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      creatorId: event.creatorId,
      invitationUrl: buildInvitationUrl(event.invitationUrl),
      invites: EventMapper.toInviteResponseDtoList(invites),
      coverUrl,
      status: event.underReviewAt ? EVENT_STATUSES.UNDER_REVIEW : EVENT_STATUSES.ACTIVE,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  static toInviteResponseDto(invite: EventInvite): EventInviteResponseDto {
    return {
      accessLevel: invite.accessLevel,
      invitationUrl: buildInvitationUrl(invite.token),
    };
  }

  static toInviteResponseDtoList(invites: EventInvite[]): EventInviteResponseDto[] {
    return [...invites]
      .sort((a, b) => (INVITE_SORT_ORDER[a.accessLevel] ?? 99) - (INVITE_SORT_ORDER[b.accessLevel] ?? 99))
      .map((invite) => EventMapper.toInviteResponseDto(invite));
  }

  static toParticipantResponseDto(participant: EventParticipant): EventParticipantResponseDto {
    return {
      userId: participant.userId,
      username: participant.username,
      name: participant.name,
      accessLevel: participant.accessLevel,
      avatarUrl: participant.avatarUrl,
      isBlockedByCaller: participant.isBlockedByCaller,
    };
  }

  static toParticipantResponseDtoList(participants: EventParticipant[]): EventParticipantResponseDto[] {
    return participants.map((participant) => EventMapper.toParticipantResponseDto(participant));
  }

  static toBanResponseDto(ban: EventBanWithUser): EventBanResponseDto {
    return {
      userId: ban.userId,
      name: ban.user.details?.name ?? null,
      username: ban.user.details?.username ?? null,
      bannedAt: ban.createdAt,
    };
  }

  static toBanListResponseDto(bans: EventBanWithUser[]): EventBanListResponseDto {
    return { items: bans.map((ban) => EventMapper.toBanResponseDto(ban)) };
  }
}
