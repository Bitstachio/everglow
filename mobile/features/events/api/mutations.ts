import { useMutation, useQueryClient } from "@tanstack/react-query";
import { eventsControllerJoin } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { eventsKeys } from "./keys";
import type { EventResponseDto, JoinEventDto } from "../types";

export const useJoinEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<EventResponseDto, Error, JoinEventDto>({
    mutationFn: async (body) => {
      const { data } = await eventsControllerJoin({ body, throwOnError: true });
      return unwrapEnvelope(data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
  });
};
