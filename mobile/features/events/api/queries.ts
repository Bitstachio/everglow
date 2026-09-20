import { useQuery } from "@tanstack/react-query";
import { eventsControllerFindAll } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { eventsKeys } from "./keys";
import type { EventResponseDto } from "../types";

export const useEventsQuery = (userId: string | undefined) =>
  useQuery({
    queryKey: eventsKeys.list(userId),
    enabled: Boolean(userId),
    queryFn: async ({ signal }): Promise<EventResponseDto[]> => {
      const { data } = await eventsControllerFindAll({ signal, throwOnError: true });
      // The generated options type the envelope as one event; runtime returns an array.
      // Keep that existing schema workaround here until the OpenAPI schema is corrected.
      return unwrapEnvelope(data) as unknown as EventResponseDto[];
    },
  });
