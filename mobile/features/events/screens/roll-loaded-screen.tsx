import { Button } from "@/components/ui/button";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { Stamp } from "@/components/ui/stamp";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { X } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { RollEnvelope } from "../components/roll-envelope";
import { useRollLoadedScreen } from "../hooks/use-roll-loaded-screen";

// The QR code at the envelope's bottom right, in points.
const CODE_SIZE = 78;

/** 04.6 Loaded: the envelope for the roll just made, stamped, with a way to send it. */
const RollLoadedScreen = () => {
  const { t } = useTranslation("create");
  const { isLoading, envelope, onSend, onOpenRoll, onClose } = useRollLoadedScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        left={
          <IconButton accessibilityLabel={t("loaded.close")} onPress={onClose}>
            <X size={18} weight="bold" color={colorTokens.text} />
          </IconButton>
        }
      />

      {isLoading ? (
        <View testID="roll-loaded-loading" className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : envelope ? (
        <ScrollView className="flex-1" contentContainerClassName="px-7.5 pb-6 pt-5.5">
          <RollEnvelope
            title={envelope.title}
            startsAt={envelope.startsAt}
            peopleCount={envelope.peopleCount}
            pickUpBy={envelope.pickUpBy}
            admits="adds"
            code={
              <QRCode
                value={envelope.invitationUrl}
                size={CODE_SIZE}
                color={colorTokens.paperInk}
                backgroundColor={colorTokens.paper}
              />
            }
            accessibilityLabel={envelope.accessibilityLabel}
          />
          <View className="mr-4 mt-21 self-end">
            <Stamp title={t("loaded.stamp")} />
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 px-5 pt-5">
          <Text className="font-sans text-body text-text-2">{t("loaded.missing")}</Text>
        </View>
      )}

      <View className="gap-2.5 px-5 pb-1">
        {envelope ? <Button title={t("loaded.send")} mark="↗" onPress={onSend} /> : null}
        <Button title={t("loaded.open")} variant="ghost" onPress={onOpenRoll} />
      </View>

      <FilmGrain />
    </SafeAreaView>
  );
};

export default RollLoadedScreen;
