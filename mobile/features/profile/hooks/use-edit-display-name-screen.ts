import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { useEditDisplayNameForm } from "./use-edit-display-name-form";

export const useEditDisplayNameScreen = () => {
  const { user } = useAuth();
  return useEditDisplayNameForm({
    initialName: user?.details?.name ?? "",
    onSuccess: () => {
      if (router.canGoBack()) router.back();
      else router.replace("/account-settings");
    },
  });
};
