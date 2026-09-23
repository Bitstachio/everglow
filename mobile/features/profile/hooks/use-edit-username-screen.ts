import { useAuth } from "@/context/auth-context";
import { router, useLocalSearchParams } from "expo-router";
import { useEditUsernameForm } from "./use-edit-username-form";

const firstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export const useEditUsernameScreen = () => {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const initialUsername = firstParam(params.username) ?? user?.details?.email.split("@")[0] ?? "";
  const { form, onSubmit } = useEditUsernameForm({
    initialUsername,
    onSuccess: (username) => router.dismissTo({ pathname: "/account-settings", params: { username } }),
  });

  return { form, onSubmit };
};
