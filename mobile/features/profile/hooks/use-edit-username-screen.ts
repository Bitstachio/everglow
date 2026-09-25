import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { useEditUsernameForm } from "./use-edit-username-form";

export const useEditUsernameScreen = () => {
  const { user } = useAuth();
  const { form, onSubmit, availability } = useEditUsernameForm({
    initialUsername: user?.details?.username ?? "",
    onSuccess: () => {
      if (router.canGoBack()) router.back();
      else router.replace("/account-settings");
    },
  });

  return { form, onSubmit, availability };
};
