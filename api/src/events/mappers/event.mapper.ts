import { Event, EventInvite } from "generated/prisma/client";
import { EventLimits, EventUsage } from "src/plans/event-plan.service";
import { galleryStateOf } from "src/plans/plans.constants";
import { EventBanListResponseDto } from "../dto/event-ban-list-response.dto";
import { EventBanResponseDto } from "../dto/event-ban-response.dto";
import { EventInviteResponseDto } from "../dto/event-invite-response.dto";
import { EventParticipantResponseDto } from "../dto/event-participant-response.dto";
import { EventResponseDto } from "../dto/event-response.dto";
import { InvitePreviewResponseDto } from "../dto/invite-preview-response.dto";
import { EVENT_STATUSES, INVITE_PREVIEW_STATES } from "../events.constants";
import { buildInvitationUrl } from "../events.invitation";
import { EventBanWithUser, EventParticipant, InvitePreview } from "../events.types";

const INVITE_SORT_ORDER: Record<string, number> = {
  PARTICIPANT: 0,
  VIEWER: 1,
};

export class EventMapper {
  /**
   * `coverUrl` is presigned by the caller; the mapper never sees S3, and the key is never returned.
   * `limits` and `usage` come from EventPlanService (limitsOf, usageFor);
   * `photoCount` from PhotoVisibilityService.countVisibleTo, for the caller.
   */
  static toResponseDto(
    event: Event,
    coverUrl: string | null,
    limits: EventLimits,
    usage: EventUsage,
    photoCount: number,
    invites: EventInvite[] = [],
  ): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      // A suspended event's details are hidden; the title stays, so members know which it is.
      description: event.suspendedAt ? null : event.description,
      date: event.date,
      creatorId: event.creatorId,
      invitationUrl: buildInvitationUrl(event.invitationUrl),
      invites: EventMapper.toInviteResponseDtoList(invites),
      coverUrl,
      status: event.suspendedAt
        ? EVENT_STATUSES.SUSPENDED
        : event.underReviewAt
          ? EVENT_STATUSES.UNDER_REVIEW
          : EVENT_STATUSES.ACTIVE,
      plan: limits.plan,
      galleryState: galleryStateOf(event),
      galleryOpensAt: event.galleryOpensAt,
      galleryClosesAt: event.galleryClosesAt,
      galleryWindowDays: event.galleryWindowDays,
      galleryWindowOptions: limits.galleryWindowOptions,
      deactivatedAt: event.deactivatedAt,
      deactivatedById: event.deactivatedById,
      limits: { members: limits.memberLimit, storageBytes: limits.storageLimitBytes?.toString() ?? null },
      usage: { members: usage.members, storageBytes: usage.storageBytes.toString() },
      photoCount,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  /** No cover, description or invites: the caller isn't a member yet. */
  static toInvitePreviewResponseDto(preview: InvitePreview): InvitePreviewResponseDto {
    const { event } = preview;
    return {
      state: preview.state,
      eventId: preview.state === INVITE_PREVIEW_STATES.ALREADY_A_MEMBER ? event.id : null,
      title: event.title,
      date: event.date,
      invitationUrl: buildInvitationUrl(preview.token),
      accessLevel: preview.accessLevel,
      galleryState: galleryStateOf(event),
      galleryOpensAt: event.galleryOpensAt,
      galleryClosesAt: event.galleryClosesAt,
      memberCount: preview.memberCount,
      memberLimit: preview.memberLimit,
      host: preview.host ? { userId: preview.host.userId, name: preview.host.name } : null,
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
      photoCount: participant.photoCount,
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
