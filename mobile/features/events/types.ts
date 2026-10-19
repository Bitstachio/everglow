import type { EventResponseDto, PhotoResponseDto } from "@/lib/api/generated";

export type {
  AccessLevel,
  CreateEventDto,
  EventParticipantResponseDto,
  EventResponseDto,
  JoinEventDto,
  NewEventResponseDto,
  PhotoResponseDto,
  UpdateEventDto,
  UserLimitsResponseDto,
} from "@/lib/api/generated";
export type { EditEventDateValues } from "./hooks/use-edit-event-date-form";
export type { EditEventDescriptionValues } from "./hooks/use-edit-event-description-form";
export type { EditEventTitleValues } from "./hooks/use-edit-event-title-form";
export type { JoinEventValues } from "./hooks/use-join-event-form";
export type { NewRollValues } from "./hooks/use-new-roll-form";

export type Event = EventResponseDto & {
  isJoined?: boolean;
};

export type Photo = PhotoResponseDto;

/**
 * The Add Photos button while an upload runs. `preparing` covers the picker
 * being open and the seconds after it closes while iOS copies the selected
 * photos into the app, before anything is sent.
 */
export type PhotoUploadStatus = { phase: "preparing" } | { phase: "uploading"; done: number; total: number };
