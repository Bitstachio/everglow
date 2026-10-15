import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { FilmStrip } from "@/components/ui/film-strip";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type LayoutChangeEvent } from "react-native";

type CantConnectScreenProps = {
  /** Repeats the step that couldn't reach Everglow. */
  onRetry: () => void;
  isRetrying: boolean;
};

const BLANKS = [1, 2, 3, 4].map((number) => ({ key: String(number), number }));

/**
 * 01.7 Can't connect: no network, or the API is down. Nothing is lost; Try
 * again repeats the last step. A strip of unexposed frames is crossed out.
 */
export const CantConnectScreen = ({ onRetry, isRetrying }: CantConnectScreenProps) => {
  const { t } = useTranslation("start");
  const [strip, setStrip] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStrip({ width: Math.round(width), height: Math.round(height) });
  };

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <View className="flex-1 justify-center gap-10">
        <View className="gap-3 px-5">
          <EdgePrint>{t("connection.edge")}</EdgePrint>
          <Display dim={t("connection.titleDim")}>{t("connection.title")}</Display>
          <Text className="font-sans text-body text-text-2">{t("connection.body")}</Text>
        </View>
        <View onLayout={onLayout}>
          <FilmStrip frames={BLANKS} />
          {strip.width > 0 ? (
            <View className="absolute inset-0 items-center justify-center">
              <GreasePencil mark="cross" width={strip.width * 0.32} height={strip.height * 0.9} drawOn />
            </View>
          ) : null}
        </View>
      </View>
      <View className="px-5 pb-2">
        <Button title={t("connection.retry")} mark="↻" onPress={onRetry} isLoading={isRetrying} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};
