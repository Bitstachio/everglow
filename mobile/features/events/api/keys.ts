import { eventsControllerFindAllQueryKey } from "@/lib/api/generated/@tanstack/react-query.gen";

export const eventsKeys = {
  all: eventsControllerFindAllQueryKey(),
  list: (userId: string | undefined) => [...eventsKeys.all, { userId }] as const,
};
