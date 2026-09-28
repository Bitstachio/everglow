import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUpdateEventMutation } from "../api/mutations";

const editEventTitleSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(100, "Title must be 100 characters or fewer."),
});

export type EditEventTitleValues = z.infer<typeof editEventTitleSchema>;

type UseEditEventTitleFormParams = {
  eventId: string;
  initialTitle: string;
  onSuccess: () => void;
};

export const useEditEventTitleForm = ({ eventId, initialTitle, onSuccess }: UseEditEventTitleFormParams) => {
  const mutation = useUpdateEventMutation(eventId);
  const submitting = useRef(false);
  const form = useForm<EditEventTitleValues>({
    resolver: zodResolver(editEventTitleSchema),
    defaultValues: { title: initialTitle },
    mode: "onTouched",
  });
  const { reset } = form;

  useEffect(() => {
    reset({ title: initialTitle }, { keepDirtyValues: true });
  }, [initialTitle, reset]);

  const onSubmit = () =>
    form.handleSubmit(async ({ title }) => {
      if (submitting.current) return;
      if (title === initialTitle) {
        reset({ title });
        onSuccess();
        return;
      }
      submitting.current = true;
      form.clearErrors("root");
      try {
        await mutation.mutateAsync({ title });
        reset({ title });
        onSuccess();
      } catch (error) {
        form.setError("root.server", { message: getErrorMessage(error, "Failed to update event title") });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit };
};
