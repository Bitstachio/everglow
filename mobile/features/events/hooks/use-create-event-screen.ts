import { useState } from "react";
import { Alert, Clipboard, Share } from "react-native";
import { useRouter } from "expo-router";
import { getErrorMessage } from "@/lib/api/errors";
import type { EventResponseDto } from "../types";
import { useCreateEventForm } from "./use-create-event-form";

export const useCreateEventScreen = () => {
  const router = useRouter();
  const [createdEvent, setCreatedEvent] = useState<EventResponseDto | null>(null);
  const { form, onSubmit } = useCreateEventForm({ onSuccess: setCreatedEvent });

  const handleCopyLink = () => {
    if (!createdEvent) return;
    Clipboard.setString(createdEvent.invitationUrl);
    Alert.alert("Copied!", "Invitation link copied to clipboard");
  };

  const handleShareLink = async () => {
    if (!createdEvent) return;
    try {
      await Share.share({ message: `Join "${createdEvent.title}" via ${createdEvent.invitationUrl}` });
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to share invitation"));
    }
  };

  return {
    form,
    onSubmit,
    createdEvent,
    handleCopyLink,
    handleShareLink,
    handleCreateAnother: () => setCreatedEvent(null),
    handleDone: () => router.back(),
  };
};
