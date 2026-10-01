import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorCode, getErrorMessage } from "@/lib/api/errors";

/** Join failures that belong on the invitation field (see `error-messages.ts`). */
const JOIN_INVITATION_FIELD_ERROR_CODES = [
  "ORGANIZER_BLOCKED_BY_CALLER",
  "REMOVED_FROM_EVENT",
  "EVENT_UNDER_REVIEW",
] as const;

const isJoinInvitationFieldError = (error: unknown): boolean => {
  const code = getErrorCode(error);
  return code != null && (JOIN_INVITATION_FIELD_ERROR_CODES as readonly string[]).includes(code);
};
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "react-native";
import { z } from "zod";
import { useJoinEventMutation } from "../api/mutations";
import type { EventResponseDto } from "../types";

const joinEventSchema = z.object({
  // The API accepts both full invitation URLs and bare invite tokens.
  invitationUrl: z
    .string()
    .trim()
    .min(1, "Please paste the invitation URL or invite token.")
    .max(255, "Invitation must be 255 characters or fewer."),
});

export type JoinEventValues = z.infer<typeof joinEventSchema>;

type UseJoinEventFormParams = {
  visible: boolean;
  onSuccess: (event: EventResponseDto) => void;
};

export const useJoinEventForm = ({ visible, onSuccess }: UseJoinEventFormParams) => {
  const mutation = useJoinEventMutation();
  const submitting = useRef(false);
  const form = useForm<JoinEventValues>({
    resolver: zodResolver(joinEventSchema),
    defaultValues: { invitationUrl: "" },
    mode: "onTouched",
  });
  const { reset } = form;

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors("invitationUrl");
    try {
      const event = await mutation.mutateAsync(values);
      reset();
      onSuccess(event);
    } catch (error) {
      if (isJoinInvitationFieldError(error)) {
        form.setError("invitationUrl", { message: getErrorMessage(error) });
        return;
      }
      Alert.alert("Error", getErrorMessage(error, "Failed to join event"));
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

  const onScan = async (invitationUrl: string) => {
    if (submitting.current) return;
    form.setValue("invitationUrl", invitationUrl, { shouldDirty: true });
    await onSubmit();
  };

  return { form, onSubmit, onScan };
};
