import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCreateEventMutation } from "../api/mutations";
import type { EventResponseDto } from "../types";

const createEventSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(100, "Title must be 100 characters or fewer."),
  description: z.string().trim().max(255, "Description must be 255 characters or fewer."),
  date: z.date({ error: "Choose a valid event date and time." }),
});

export type CreateEventValues = z.infer<typeof createEventSchema>;

const defaultValues = (): CreateEventValues => ({ title: "", description: "", date: new Date() });

export const useCreateEventForm = ({ onSuccess }: { onSuccess: (event: EventResponseDto) => void }) => {
  const mutation = useCreateEventMutation();
  const submitting = useRef(false);
  const form = useForm<CreateEventValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: defaultValues(),
    mode: "onTouched",
  });

  const submit = form.handleSubmit(async ({ title, description, date }) => {
    form.clearErrors("root");
    try {
      const event = await mutation.mutateAsync({
        title,
        ...(description ? { description } : {}),
        date: date.toISOString(),
      });
      form.reset(defaultValues());
      onSuccess(event);
    } catch (error) {
      form.setError("root.server", { message: getErrorMessage(error, "Failed to create event") });
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
