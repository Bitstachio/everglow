import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUpdateProfileMutation } from "../api/mutations";

const editDisplayNameSchema = z.object({
  name: z.string().trim().min(1, "Your frames need a name").max(255, "255 characters at most"),
});

export type EditDisplayNameValues = z.infer<typeof editDisplayNameSchema>;

type UseEditDisplayNameFormParams = {
  initialName: string;
  onSuccess: () => void;
};

export const useEditDisplayNameForm = ({ initialName, onSuccess }: UseEditDisplayNameFormParams) => {
  const mutation = useUpdateProfileMutation();
  const submitting = useRef(false);
  const form = useForm<EditDisplayNameValues>({
    resolver: zodResolver(editDisplayNameSchema),
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
          message: getErrorMessage(error, "Couldn’t save your card. Try again."),
        });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit };
};
