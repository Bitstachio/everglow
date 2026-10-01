import { useState } from "react";
import { Alert, Clipboard, Share } from "react-native";
import { useRouter } from "expo-router";
import { getErrorMessage } from "@/lib/api/errors";
import type { AccessLevel, EventResponseDto } from "../types";
import { getAccessLevelLabel } from "../utils";
import { useCreateEventForm } from "./use-create-event-form";

export const useCreateEventScreen = () => {
  const router = useRouter();
  const [createdEvent, setCreatedEvent] = useState<EventResponseDto | null>(null);
  const { form, onSubmit } = useCreateEventForm({ onSuccess: setCreatedEvent });

  const handleCopyLink = (invitationUrl: string) => {
    Clipboard.setString(invitationUrl);
    Alert.alert("Copied!", "Invitation link copied to clipboard");
  };

  const handleShareLink = async (invitationUrl: string, accessLevel: AccessLevel) => {
    if (!createdEvent) return;
    const roleLabel = getAccessLevelLabel(accessLevel);
    try {
      await Share.share({
        message: `Join "${createdEvent.title}" as ${roleLabel} via ${invitationUrl}`,
      });
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to share invitation"));
    }
  };

  const handleGoToEvent = () => {
    if (!createdEvent) return;
    router.replace(`/events/${createdEvent.id}`);
  };

  return {
    form,
    onSubmit,
    createdEvent,
    handleCopyLink,
    handleShareLink,
    handleGoToEvent,
    handleShareLater: () => router.back(),
  };
};
