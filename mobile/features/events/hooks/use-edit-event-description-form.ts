import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useUpdateEventMutation } from "../api/mutations";

export type EditEventDescriptionValues = {
  description: string;
};

type UseEditEventDescriptionFormParams = {
  eventId: string;
  initialDescription: string;
  onSuccess: () => void;
};

/** Saves or clears the note for guests from settings. */
export const useEditEventDescriptionForm = ({
  eventId,
  initialDescription,
  onSuccess,
}: UseEditEventDescriptionFormParams) => {
  const { t } = useTranslation("roll");
  const mutation = useUpdateEventMutation(eventId);
  const submitting = useRef(false);
  const schema = z.object({
    description: z.string().trim().max(255, t("settings.editNote.tooLong")),
  });
  const form = useForm<EditEventDescriptionValues>({
    resolver: zodResolver(schema),
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
        form.setError("root.server", { message: getErrorMessage(error, t("settings.editNote.failed")) });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit };
};
