import type { EventResponseDto, PhotoResponseDto } from "@/lib/api/generated";

export type {
  AccessLevel,
  CreateEventDto,
  EventParticipantResponseDto,
  EventResponseDto,
  InvitePreviewResponseDto,
  InvitePreviewState,
  JoinEventDto,
  NewEventResponseDto,
  PhotoResponseDto,
  UpdateEventDto,
  UserLimitsResponseDto,
} from "@/lib/api/generated";
export type { EditEventDateValues } from "./hooks/use-edit-event-date-form";
export type { EditEventDescriptionValues } from "./hooks/use-edit-event-description-form";
export type { EditEventTitleValues } from "./hooks/use-edit-event-title-form";
export type { NewRollValues } from "./hooks/use-new-roll-form";

export type Event = EventResponseDto & {
  isJoined?: boolean;
};

export type Photo = PhotoResponseDto;
