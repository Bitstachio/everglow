import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useUpdateEventMutation } from "../api/mutations";

export type EditEventTitleValues = {
  title: string;
};

type UseEditEventTitleFormParams = {
  eventId: string;
  initialTitle: string;
  onSuccess: () => void;
};

/** Saves a new roll name from settings. */
export const useEditEventTitleForm = ({ eventId, initialTitle, onSuccess }: UseEditEventTitleFormParams) => {
  const { t } = useTranslation("roll");
  const mutation = useUpdateEventMutation(eventId);
  const submitting = useRef(false);
  const schema = z.object({
    title: z
      .string()
      .trim()
      .min(1, t("settings.editName.required"))
      .max(100, t("settings.editName.tooLong")),
  });
  const form = useForm<EditEventTitleValues>({
    resolver: zodResolver(schema),
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
        form.setError("root.server", { message: getErrorMessage(error, t("settings.editName.failed")) });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit };
};
