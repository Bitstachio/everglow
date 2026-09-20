import { useMutation, useQueryClient } from "@tanstack/react-query";
import { eventsControllerCreate, eventsControllerJoin } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { eventsKeys } from "./keys";
import type { CreateEventDto, EventResponseDto, JoinEventDto } from "../types";

export const useCreateEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<EventResponseDto, Error, CreateEventDto>({
    mutationFn: async (body) => {
      const { data } = await eventsControllerCreate({ body, throwOnError: true });
      return unwrapEnvelope(data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
  });
};

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
