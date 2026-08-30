import type { EventResponseDto } from "@/lib/api/generated";

export type Event = EventResponseDto & {
  isJoined?: boolean;
};
