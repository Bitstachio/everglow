import { RefreshControl, ScrollView, View } from "react-native";
import { ProfileHeader } from "../components/ProfileHeader/ProfileHeader";
import { ProfileAccountSection } from "../components/ProfileAccountSection/ProfileAccountSection";
import { ProfileActions } from "../components/ProfileActions/ProfileActions";
import { EditProfileModal } from "../components/EditProfileModal/EditProfileModal";
import { useProfileScreen } from "../hooks/useProfileScreen";

export const ProfileScreen = () => {
  const {
    profile,
    isRefreshing,
    isAuthLoading,
    isDeletingAccount,
    editProfileModal,
    avatarPicker,
    handleLogout,
    handleDeleteAccount,
    refresh,
  } = useProfileScreen();

  return (
    <ScrollView
      className="flex-1 bg-ui-surface dark:bg-dark-background"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
    >
      <View className="flex-1 px-6">
        <ProfileHeader
          name={profile?.details?.name}
          email={profile?.details?.email}
          avatarUrl={profile?.details?.avatarUrl}
          isAvatarLoading={avatarPicker.isAvatarLoading}
          onAvatarPress={avatarPicker.showAvatarActions}
        />
        <ProfileAccountSection onEditProfile={editProfileModal.open} />
        <ProfileActions
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          isLogoutLoading={isAuthLoading}
          isDeletingAccount={isDeletingAccount}
        />
      </View>
      <EditProfileModal
        visible={editProfileModal.visible}
        name={editProfileModal.form.name}
        email={editProfileModal.form.email}
        isSubmitting={editProfileModal.isSubmitting}
        onChangeName={(value) => editProfileModal.updateField("name", value)}
        onChangeEmail={(value) => editProfileModal.updateField("email", value)}
        onSubmit={() => void editProfileModal.submit()}
        onClose={editProfileModal.close}
      />
    </ScrollView>
  );
};
