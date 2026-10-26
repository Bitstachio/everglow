import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useUpdateProfileMutation } from "../api/mutations";

const makeEditDisplayNameSchema = (t: TFunction<"you">) =>
  z.object({
    name: z.string().trim().min(1, t("editCard.nameRequired")).max(255, t("editCard.nameTooLong")),
  });

export type EditDisplayNameValues = z.infer<ReturnType<typeof makeEditDisplayNameSchema>>;

type UseEditDisplayNameFormParams = {
  initialName: string;
  onSuccess: () => void;
};

export const useEditDisplayNameForm = ({ initialName, onSuccess }: UseEditDisplayNameFormParams) => {
  const { t } = useTranslation("you");
  const mutation = useUpdateProfileMutation();
  const submitting = useRef(false);
  const schema = useMemo(() => makeEditDisplayNameSchema(t), [t]);
  const form = useForm<EditDisplayNameValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName },
    mode: "onTouched",
  });
  const { reset } = form;

  useEffect(() => {
    reset({ name: initialName }, { keepDirtyValues: true });
  }, [initialName, reset]);

  const onSubmit = () =>
    form.handleSubmit(async ({ name }) => {
      if (submitting.current) return;
      if (name === initialName) {
        reset({ name });
        return;
      }
      submitting.current = true;
      form.clearErrors("root");
      try {
        await mutation.mutateAsync({ name });
        reset({ name });
        onSuccess();
      } catch (error) {
        form.setError("root.server", {
          message: getErrorMessage(error, t("editCard.failed")),
        });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit };
};
