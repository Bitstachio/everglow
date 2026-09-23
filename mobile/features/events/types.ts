import type { EventResponseDto, PhotoResponseDto } from "@/lib/api/generated";

export type {
  AccessLevel,
  CreateEventDto,
  EventParticipantResponseDto,
  EventResponseDto,
  JoinEventDto,
  PhotoResponseDto,
  UpdateEventDto,
} from "@/lib/api/generated";
export type { CreateEventValues } from "./hooks/use-create-event-form";
export type { EditEventValues } from "./hooks/use-edit-event-form";
export type { JoinEventValues } from "./hooks/use-join-event-form";

export type Event = EventResponseDto & {
  isJoined?: boolean;
};

export type Photo = PhotoResponseDto;
