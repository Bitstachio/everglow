import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { useChangeAvatar } from "./use-change-avatar";
import { useEditDisplayNameForm } from "./use-edit-display-name-form";
import { useLabCard } from "./use-lab-card";

/** 14.2 Edit the card: the name is saved with Save; a new photo is saved as soon as it is picked. */
export const useEditCardScreen = () => {
  const { user } = useAuth();
  const { card } = useLabCard();
  const { hasAvatar, isUpdatingAvatar, handleChangeAvatar } = useChangeAvatar();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/account-settings"));
  const { form, onSubmit } = useEditDisplayNameForm({ initialName: user?.details?.name ?? "", onSuccess: close });

  return {
    title: card.title,
    photoUri: card.photoUri,
    photoCacheKey: card.photoCacheKey,
    username: user?.details ? `@${user.details.username}` : "",
    form,
    hasAvatar,
    isUpdatingAvatar,
    onChangePhoto: handleChangeAvatar,
    onSave: onSubmit,
    onCancel: close,
  };
};
