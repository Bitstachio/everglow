import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { OptionRow } from "@/components/ui/option-row";
import { PaperButton } from "@/components/ui/lab-paper";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Slip } from "@/components/ui/slip";
import { Stamp } from "@/components/ui/stamp";
import { CloseButton, TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { Trans, useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { RollEnvelope } from "../components/roll-envelope";
import { useEnvelopeScreen } from "../hooks/use-envelope-screen";

/** 05.1–05.7 The envelope: what an organizer sends so people can join the roll. */
const EnvelopeScreen = () => {
  const { t } = useTranslation("envelope");
  const {
    edge,
    envelope,
    readyStamp,
    invitationUrl,
    shut,
    isLoading,
    isError,
    reset,
    onSelectKind,
    onShare,
    onReset,
    onSelectResetKind,
    onCloseReset,
    onConfirmReset,
    onRetry,
    onClose,
  } = useEnvelopeScreen();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <TopBar
        tone="paper"
        title={edge ?? undefined}
        left={
          envelope && invitationUrl ? (
            <PaperButton title={t("reset.cta")} onPress={onReset} accessibilityLabel={t("reset.a11y")} />
          ) : undefined
        }
        right={<CloseButton testID="envelope-close" accessibilityLabel={t("close")} onPress={onClose} tone="paper" />}
      />
      {isError ? (
        <View className="items-start gap-2 px-5 pt-4">
          <Text className="font-sans text-body text-paper-ink-2">{t("loadFailed")}</Text>
          <PaperButton title={t("retry")} onPress={onRetry} />
        </View>
      ) : isLoading || !envelope ? (
        <View testID="envelope-loading" className="flex-1 bg-paper" />
      ) : shut ? (
        <ScrollView className="flex-1" contentContainerClassName="flex-grow pb-6">
          {/* No one new comes in: the envelope lies dimmed under a stamp that says why (05.6–05.7). */}
          <View className="min-h-80 flex-1 opacity-55">
            <RollEnvelope {...envelope} />
          </View>
          <View className="h-26">
            <Stamp title={shut.stamp} subtitle={shut.stampLine} className="absolute right-14.5 top-2" />
          </View>
          <Text className="mt-8 px-5 font-sans text-body text-paper-ink-2">
            <Trans
              t={t}
              i18nKey={`${shut.state}.body`}
              values={{ date: shut.date }}
              components={{ value: <Text className="font-sans-semibold text-paper-ink" /> }}
            />
          </Text>
        </ScrollView>
      ) : (
        <View className="flex-1">
          <RollEnvelope
            {...envelope}
            onSelect={onSelectKind}
            stamp={readyStamp ? <Stamp title={readyStamp} /> : undefined}
            action={
              invitationUrl ? (
                <PaperButton title={t("share.cta")} mark="↗" onPress={() => void onShare()} />
              ) : undefined
            }
            code={
              invitationUrl ? (
                <QRCode
                  value={invitationUrl}
                  size={210}
                  color={colorTokens.paperInk}
                  backgroundColor={colorTokens.paper}
                />
              ) : undefined
            }
          />
        </View>
      )}

      <BottomSheet visible={reset.visible} onClose={onCloseReset}>
        <Slip title={t("reset.title")} body={reset.body}>
          <View accessibilityRole="radiogroup">
            {reset.choices.map((choice) => (
              <OptionRow
                key={choice.key}
                title={choice.title}
                description={choice.description}
                selected={reset.choice === choice.key}
                disabled={reset.isResetting}
                onPress={() => onSelectResetKind(choice.key)}
              />
            ))}
          </View>
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
