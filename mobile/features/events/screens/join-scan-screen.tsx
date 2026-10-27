import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { IconButton } from "@/components/ui/icon-button";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { CameraView } from "expo-camera";
import { Lightning, X } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { PasteLinkSlip } from "../components/paste-link-slip";
import { Viewfinder } from "../components/viewfinder";
import { useJoinScanScreen } from "../hooks/use-join-scan-screen";

/**
 * 06.1 Scan: the camera, dimmed, behind a viewfinder, with what it's looking
 * for underneath and a way to paste a link instead (06.2). The drawing turns
 * the feed black and white; native cameras can't, so it is only dimmed.
 */
const JoinScanScreen = () => {
  const { t } = useTranslation("join");
  const {
    camera,
    torch,
    pasteVisible,
    link,
    fromClipboard,
    canOpenLink,
    onScanned,
    onToggleTorch,
    onAllowCamera,
    onOpenSettings,
    onClose,
    onPasteInstead,
    onChangeLink,
    onOpenLink,
    onClosePaste,
  } = useJoinScanScreen();

  return (
    <View className="flex-1 bg-viewer">
      {camera === "on" ? (
        <CameraView
          testID="join-camera"
          className="absolute inset-0"
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={pasteVisible ? undefined : onScanned}
        />
      ) : null}
      <View pointerEvents="none" className="absolute inset-0 bg-viewer opacity-50" />

      <SafeAreaView className="flex-1">
        <TopBar
          title={t("scan.edge")}
          left={
            <IconButton accessibilityLabel={t("scan.close")} onPress={onClose}>
              <X size={18} weight="bold" color={colorTokens.text} />
            </IconButton>
          }
          right={
            camera === "on" ? (
              <IconButton
                accessibilityLabel={torch ? t("scan.torchOff") : t("scan.torchOn")}
                accessibilityState={{ selected: torch }}
                onPress={onToggleTorch}
              >
                <Lightning size={18} weight={torch ? "fill" : "bold"} color={colorTokens.text} />
              </IconButton>
            ) : null
          }
        />

        <View className="flex-1 justify-center px-12">
          <Viewfinder />
          {camera === "off" || camera === "blocked" ? (
            <View className="absolute inset-x-12 items-center gap-3">
              <EdgePrint tone="text">{t("scan.cameraOff")}</EdgePrint>
              <Button
                title={camera === "off" ? t("scan.allowCamera") : t("scan.openSettings")}
                variant="ghost"
                fullWidth={false}
                onPress={camera === "off" ? onAllowCamera : onOpenSettings}
              />
            </View>
          ) : null}
        </View>

        <View className="bg-viewer px-5 pb-1 pt-5.5">
          <View className="flex-row justify-between border-b border-t border-line py-2.5">
            <EdgePrint>{t("scan.lookingFor")}</EdgePrint>
            <EdgePrint>
              <EdgeValue>{t("scan.target")}</EdgeValue>
            </EdgePrint>
          </View>
          <Display variant="slip" className="mb-1.5 mt-5">
            {t("scan.title")}
          </Display>
          <EdgePrint>{t("scan.hint")}</EdgePrint>
          <Button
            title={t("scan.pasteInstead")}
            variant="secondary"
            mark="▸"
            className="mt-5"
            onPress={() => void onPasteInstead()}
          />
        </View>
      </SafeAreaView>

      <BottomSheet visible={pasteVisible} onClose={onClosePaste}>
        <PasteLinkSlip
          edge={t("paste.edge")}
          title={t("paste.title")}
          label={t("paste.label")}
          placeholder={t("paste.placeholder")}
          note={fromClipboard ? t("paste.fromClipboard") : undefined}
          openLabel={t("paste.open")}
          value={link}
          canOpen={canOpenLink}
          onChangeText={onChangeLink}
          onOpen={onOpenLink}
        />
      </BottomSheet>
    </View>
  );
};

export default JoinScanScreen;
