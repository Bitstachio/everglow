import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUpdateEventMutation } from "../api/mutations";
import type { EventResponseDto } from "../types";

const editEventSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(100, "Title must be 100 characters or fewer."),
  description: z.string().trim().max(255, "Description must be 255 characters or fewer."),
  date: z.date({ error: "Choose a valid event date and time." }),
});

export type EditEventValues = z.infer<typeof editEventSchema>;

export const valuesFromEvent = (event: EventResponseDto): EditEventValues => ({
  title: event.title,
  description: event.description ?? "",
  date: new Date(event.date),
});

type UseEditEventFormParams = {
  eventId: string;
  event: EventResponseDto | null;
  onSuccess: () => void;
};

export const useEditEventForm = ({ eventId, event, onSuccess }: UseEditEventFormParams) => {
  const mutation = useUpdateEventMutation(eventId);
  const submitting = useRef(false);
  const form = useForm<EditEventValues>({
    resolver: zodResolver(editEventSchema),
    defaultValues: event ? valuesFromEvent(event) : { title: "", description: "", date: new Date() },
    mode: "onTouched",
  });

  const submit = form.handleSubmit(async ({ title, description, date }) => {
    form.clearErrors("root");
    try {
      await mutation.mutateAsync({
        title,
        description: description || null,
        date: date.toISOString(),
      });
      onSuccess();
    } catch (error) {
      form.setError("root.server", { message: getErrorMessage(error, "Failed to update event") });
    }
  });

  const onSubmit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await submit();
    } finally {
      submitting.current = false;
    }
  };

  return { form, onSubmit };
};
