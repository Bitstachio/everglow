import type { EventResponseDto } from "@/lib/api/generated";

export type { EventResponseDto, JoinEventDto } from "@/lib/api/generated";

export type Event = EventResponseDto & {
  isJoined?: boolean;
};
