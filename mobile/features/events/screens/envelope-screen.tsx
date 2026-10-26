import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { X } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { RollEnvelope } from "../components/roll-envelope";
import { useEnvelopeScreen } from "../hooks/use-envelope-screen";

/** 05.1–05.2 The envelope: what a host sends so people can join the roll. */
const EnvelopeScreen = () => {
  const { t } = useTranslation("envelope");
  const { edge, envelope, invitationUrl, isLoading, isError, onSelectKind, onRetry, onClose } = useEnvelopeScreen();

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
            <View className="mx-7.5 mt-5">
              <RollEnvelope
                {...envelope}
                onSelect={onSelectKind}
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
      <FilmGrain />
    </SafeAreaView>
  );
};

export default EnvelopeScreen;
