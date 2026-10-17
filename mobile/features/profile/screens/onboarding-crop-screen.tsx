import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AvatarCropper } from "../components/avatar-cropper";
import { useOnboardingCropScreen } from "../hooks/use-onboarding-crop-screen";

/** 02.8 Move and scale: frame the photo in the card's circle, then Use. */
const OnboardingCropScreen = () => {
  const { t } = useTranslation("onboarding");
  const { uri, photo, radius, isSaving, onPlace, onCancel, onUse } = useOnboardingCropScreen();

  return (
    <GestureHandlerRootView className="flex-1 bg-viewer">
      <AvatarCropper uri={uri} photo={photo} radius={radius} onChange={onPlace} />
      <SafeAreaView pointerEvents="box-none" className="flex-1">
        <View className="h-14 flex-row items-center justify-between px-3">
          <View>
            <Button title={t("crop.cancel")} variant="ghost" fullWidth={false} onPress={onCancel} disabled={isSaving} />
          </View>
          <EdgePrint>{t("crop.title")}</EdgePrint>
          <View>
            <Button title={t("crop.use")} variant="ghost" fullWidth={false} onPress={onUse} isLoading={isSaving} />
          </View>
        </View>
        <View pointerEvents="none" className="mt-auto px-5 pb-6">
          <EdgePrint className="text-center">{t("crop.hint")}</EdgePrint>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

export default OnboardingCropScreen;
