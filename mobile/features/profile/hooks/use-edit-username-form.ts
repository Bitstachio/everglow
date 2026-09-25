import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorCode, getErrorMessage, isApiError } from "@/lib/api/errors";
import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useUpdateProfileMutation } from "../api/mutations";
import {
  editUsernameSchema,
  normalizeUsername,
  usernameAvailabilityMessage,
  type EditUsernameValues,
} from "../lib/username";
import { useUsernameAvailability } from "./use-username-availability";

export type { EditUsernameValues };

type UseEditUsernameFormParams = {
  initialUsername: string;
  onSuccess: () => void;
};

export const useEditUsernameForm = ({ initialUsername, onSuccess }: UseEditUsernameFormParams) => {
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
        if (getErrorCode(error) === "USERNAME_TAKEN") {
          form.setError("username", {
            message: usernameAvailabilityMessage("TAKEN") ?? "This username is taken",
          });
          return;
        }
        if (isApiError(error) && error.status === 400) {
          form.setError("username", {
            message: getErrorMessage(error, usernameAvailabilityMessage("INVALID_FORMAT") ?? "Invalid username"),
          });
          return;
        }
        form.setError("root.server", {
          message: getErrorMessage(error, "Could not update your username. Please try again."),
        });
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit, availability };
};
