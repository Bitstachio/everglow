import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUpdateEventMutation } from "../api/mutations";

const editEventDescriptionSchema = z.object({
  description: z.string().trim().max(255, "Description must be 255 characters or fewer."),
});

export type EditEventDescriptionValues = z.infer<typeof editEventDescriptionSchema>;

type UseEditEventDescriptionFormParams = {
  eventId: string;
  initialDescription: string;
  onSuccess: () => void;
};

export const useEditEventDescriptionForm = ({
  eventId,
  initialDescription,
  onSuccess,
}: UseEditEventDescriptionFormParams) => {
  const mutation = useUpdateEventMutation(eventId);
  const submitting = useRef(false);
  const form = useForm<EditEventDescriptionValues>({
    resolver: zodResolver(editEventDescriptionSchema),
    defaultValues: { description: initialDescription },
    mode: "onTouched",
  });
  const { reset } = form;

  useEffect(() => {
    reset({ description: initialDescription }, { keepDirtyValues: true });
  }, [initialDescription, reset]);

  const onSubmit = () =>
    form.handleSubmit(async ({ description }) => {
      if (submitting.current) return;
      if (description === initialDescription) {
        reset({ description });
        onSuccess();
        return;
      }
      submitting.current = true;
      form.clearErrors("root");
      try {
        await mutation.mutateAsync({ description: description || null });
        reset({ description });
        onSuccess();
      } catch (error) {
        form.setError("root.server", { message: getErrorMessage(error, "Failed to update event description") });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit };
};
