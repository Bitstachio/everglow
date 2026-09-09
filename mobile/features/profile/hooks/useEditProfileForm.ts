import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorMessage } from "@/lib/api/errors";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "react-native";
import { z } from "zod";
import { useUpdateProfileMutation } from "../api/mutations";
import type { UpdateUserDto, UserResponseDto } from "../types";

const editProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
});

export type EditProfileValues = z.infer<typeof editProfileSchema>;

type UseEditProfileFormParams = {
  user: UserResponseDto | null;
  onSuccess: () => void;
};

const buildProfilePatch = (
  values: EditProfileValues,
  dirtyFields: Partial<Readonly<Record<keyof EditProfileValues, boolean>>>,
): UpdateUserDto => {
  const patch: UpdateUserDto = {};

  if (dirtyFields.name) patch.name = values.name;
  if (dirtyFields.email) patch.email = values.email;

  return patch;
};

export const useEditProfileForm = ({ user, onSuccess }: UseEditProfileFormParams) => {
  const updateProfileMutation = useUpdateProfileMutation();

  const form = useForm<EditProfileValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: { name: user?.details?.name ?? "", email: user?.details?.email ?? "" },
    mode: "onTouched",
  });
  const { reset } = form;

  useEffect(() => {
    if (!user?.details) return;

    reset({ name: user.details.name, email: user.details.email });
  }, [user, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    const patch = buildProfilePatch(values, form.formState.dirtyFields);

    if (Object.keys(patch).length === 0) {
      onSuccess();
      return;
    }

    try {
      await updateProfileMutation.mutateAsync(patch);
      reset(values);
      onSuccess();
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to update profile"));
    }
  });

  return { form, onSubmit };
};
