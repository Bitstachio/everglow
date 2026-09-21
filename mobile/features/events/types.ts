import type { EventResponseDto } from "@/lib/api/generated";

export type { CreateEventDto, EventResponseDto, JoinEventDto } from "@/lib/api/generated";
export type { CreateEventValues } from "./hooks/use-create-event-form";
export type { JoinEventValues } from "./hooks/use-join-event-form";

export type Event = EventResponseDto & {
  isJoined?: boolean;
};
