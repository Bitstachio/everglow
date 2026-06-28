import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useUpdateProfileMutation } from "../api/useUpdateProfileMutation";
import { ProfileApiError } from "../api/profileApi";
import type { ProfileUser } from "../types/profile";

type EditProfileForm = {
  name: string;
  email: string;
};

export const useEditProfileModal = (profile: ProfileUser | undefined) => {
  const updateProfileMutation = useUpdateProfileMutation();
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState<EditProfileForm>({
    name: profile?.details?.name ?? "",
    email: profile?.details?.email ?? "",
  });

  useEffect(() => {
    if (visible) {
      setForm({
        name: profile?.details?.name ?? "",
        email: profile?.details?.email ?? "",
      });
    }
  }, [visible, profile?.details?.email, profile?.details?.name]);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const updateField = useCallback((field: keyof EditProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  const submit = useCallback(async () => {
    const changes: Partial<EditProfileForm> = {};

    if (form.name !== profile?.details?.name) changes.name = form.name;
    if (form.email !== profile?.details?.email) changes.email = form.email;

    if (Object.keys(changes).length === 0) {
      close();
      return;
    }

    try {
      await updateProfileMutation.mutateAsync(changes);
      close();
      Alert.alert("Success", "Profile updated successfully");
    } catch (error) {
      const message = error instanceof ProfileApiError ? error.message : "Failed to update profile";
      Alert.alert("Error", message);
    }
  }, [close, form.email, form.name, profile?.details?.email, profile?.details?.name, updateProfileMutation]);

  return {
    visible,
    form,
    isSubmitting: updateProfileMutation.isPending,
    open,
    close,
    updateField,
    submit,
  };
};
