import { getErrorCode, getErrorMessage } from "@/lib/api/errors";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useUpdateProfileMutation } from "../api/mutations";
import { editUsernameSchema, normalizeUsername, type EditUsernameValues } from "../lib/username";
import { useUsernameAvailability } from "./use-username-availability";

export type { EditUsernameValues };

type UseEditUsernameFormParams = {
  initialUsername: string;
  onSuccess: () => void;
  /** USERNAME_CHANGE_LIMITED: both changes are used. Refresh the profile to learn when it opens again. */
  onLimited?: () => void;
};

export const useEditUsernameForm = ({ initialUsername, onSuccess, onLimited }: UseEditUsernameFormParams) => {
  const { t } = useTranslation("you");
  const mutation = useUpdateProfileMutation();
  const submitting = useRef(false);
  const form = useForm<EditUsernameValues>({
    resolver: zodResolver(editUsernameSchema),
    defaultValues: { username: initialUsername },
    mode: "onTouched",
  });
  const { reset, control } = form;
  const username = useWatch({ control, name: "username" });
  const availability = useUsernameAvailability(username ?? "", { currentUsername: initialUsername });

  useEffect(() => {
    reset({ username: initialUsername }, { keepDirtyValues: true });
  }, [initialUsername, reset]);

  const onSubmit = () =>
    form.handleSubmit(async ({ username: raw }) => {
      if (submitting.current) return;
      const username = normalizeUsername(raw);
      if (username === normalizeUsername(initialUsername)) {
        reset({ username });
        return;
      }
      if (!availability.canSubmit) return;

      submitting.current = true;
      form.clearErrors("root");
      form.clearErrors("username");
      try {
        await mutation.mutateAsync({ username });
        reset({ username });
        onSuccess();
      } catch (error) {
        const code = getErrorCode(error);
        if (code === "USERNAME_TAKEN" || code === "USERNAME_RESERVED") {
          form.setError("username", { message: getErrorMessage(error) });
          return;
        }
        if (code === "USERNAME_CHANGE_LIMITED" && onLimited) {
          onLimited();
          return;
        }
        form.setError("root.server", {
          message: getErrorMessage(error, t("username.failed")),
        });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit, availability };
};
