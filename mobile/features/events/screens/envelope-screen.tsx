import { AppIcon } from "@/components/ui/app-icon";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Slip } from "@/components/ui/slip";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { X } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { EnvelopeSwitch } from "../components/envelope-switch";
import { RollEnvelope } from "../components/roll-envelope";
import { useEnvelopeScreen } from "../hooks/use-envelope-screen";

/** 05.1–05.5 The envelope: what a host sends so people can join the roll. */
const EnvelopeScreen = () => {
  const { t } = useTranslation("envelope");
  const {
    edge,
    envelope,
    invitationUrl,
    kind,
    kinds,
    isLoading,
    isError,
    copied,
    reset,
    onSelectKind,
    onShare,
    onCopy,
    onReset,
    onCloseReset,
    onConfirmReset,
    onRetry,
    onClose,
  } = useEnvelopeScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={edge ?? undefined}
        left={
          <IconButton accessibilityLabel={t("close")} onPress={onClose}>
            <AppIcon icon={X} size="sm" color={colorTokens.text} />
          </IconButton>
        }
      />
      <ScrollView className="flex-1" contentContainerClassName="pb-6 pt-2.5">
        {isError ? (
          <View className="items-start gap-2 px-5 pt-4">
            <Text className="font-sans text-body text-text-2">{t("loadFailed")}</Text>
            <Button title={t("retry")} variant="ghost" fullWidth={false} className="-ml-2" onPress={onRetry} />
          </View>
        ) : isLoading || !envelope ? (
          <View testID="envelope-loading" className="mx-7.5 mt-14 h-80 -rotate-2 rounded-paper bg-sheet" />
        ) : (
          <>
            <View className="px-5">
              <EnvelopeSwitch options={kinds} selected={kind} onSelect={onSelectKind} />
            </View>
            <View className="mx-7.5 mt-5">
              <RollEnvelope
                {...envelope}
                code={
                  invitationUrl ? (
                    <QRCode
                      value={invitationUrl}
                      size={78}
                      color={colorTokens.paperInk}
                      backgroundColor={colorTokens.paper}
                    />
                  ) : undefined
                }
              />
            </View>
          </>
        )}
      </ScrollView>

      {envelope && invitationUrl ? (
        <View className="gap-2.5 px-5 pb-1 pt-3">
          <Button title={t("share.cta")} mark="↗" onPress={onShare} />
          <View className="flex-row justify-between">
            <Button
              title={copied ? t("copy.done") : t("copy.cta")}
              variant="ghost"
              fullWidth={false}
              className="-ml-2"
              onPress={onCopy}
            />
            <Button
              title={t("reset.cta")}
              accessibilityLabel={reset.a11y}
              variant="ghost"
              fullWidth={false}
              className="-mr-2 opacity-80"
              onPress={onReset}
            />
          </View>
        </View>
      ) : null}
      <FilmGrain />

      <BottomSheet visible={reset.visible} onClose={onCloseReset}>
        <Slip edge={reset.edge} title={t("reset.title")} body={reset.body}>
          <Button title={t("reset.confirm")} mark="↻" isLoading={reset.isResetting} onPress={onConfirmReset} />
          <Button
            title={t("reset.cancel")}
            variant="secondary"
            mark="‹"
            disabled={reset.isResetting}
            onPress={onCloseReset}
          />
        </Slip>
      </BottomSheet>
    </SafeAreaView>
  );
};

export default EnvelopeScreen;
