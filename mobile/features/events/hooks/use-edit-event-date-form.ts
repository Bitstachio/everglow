import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUpdateEventMutation } from "../api/mutations";

const editEventDateSchema = z.object({
  date: z.date({ error: "Choose a valid event date and time." }),
});

export type EditEventDateValues = z.infer<typeof editEventDateSchema>;

type UseEditEventDateFormParams = {
  eventId: string;
  initialDate: Date;
  onSuccess: () => void;
};

export const useEditEventDateForm = ({ eventId, initialDate, onSuccess }: UseEditEventDateFormParams) => {
  const mutation = useUpdateEventMutation(eventId);
  const submitting = useRef(false);
  const form = useForm<EditEventDateValues>({
    resolver: zodResolver(editEventDateSchema),
    defaultValues: { date: initialDate },
    mode: "onTouched",
  });
  const { reset } = form;

  useEffect(() => {
    reset({ date: initialDate }, { keepDirtyValues: true });
  }, [initialDate, reset]);

  const onSubmit = () =>
    form.handleSubmit(async ({ date }) => {
      if (submitting.current) return;
      if (date.getTime() === initialDate.getTime()) {
        reset({ date });
        onSuccess();
        return;
      }
      submitting.current = true;
      form.clearErrors("root");
      try {
        await mutation.mutateAsync({ date: date.toISOString() });
        reset({ date });
        onSuccess();
      } catch (error) {
        form.setError("root.server", { message: getErrorMessage(error, "Failed to update event date") });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit };
};
