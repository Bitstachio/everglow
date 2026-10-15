import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Display, Wordmark } from "@/components/ui/display";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { IconButton } from "@/components/ui/icon-button";
import { PencilNote } from "@/components/ui/pencil-note";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ThemedText } from "@/components/ui/themed-text";
import { colorTokens } from "@/theme/tokens";
import { Redirect, useLocalSearchParams } from "expo-router";
import { CaretLeft, DotsThree, QrCode } from "phosphor-react-native";
import { type ReactNode } from "react";
import { ScrollView, View } from "react-native";

/*
 * Development-only gallery of the contact-sheet components, for checking them
 * against the design system on a device. Open everglowmobile://design-kit, or
 * everglowmobile://design-kit?only=<section title> for one section.
 * The copy is sample data, so it is not translated.
 */

const Section = ({ title, only, children }: { title: string; only?: string; children: ReactNode }) =>
  only && only.toLowerCase() !== title.toLowerCase() ? null : (
    <View className="gap-4 border-t border-line pt-4">
      <EdgePrint>{title}</EdgePrint>
      {children}
    </View>
  );

const MARKS = ["ring", "tick", "cross", "underline", "strike"] as const;

const DesignKitScreen = () => {
  const { only } = useLocalSearchParams<{ only?: string }>();
  if (!__DEV__) return <Redirect href="/" />;

  const text = colorTokens.dark.text;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <ScrollView contentContainerClassName="gap-8 px-5 pb-16 pt-4">
        <View className="flex-row items-center justify-between">
          <IconButton accessibilityLabel="Back">
            <AppIcon icon={CaretLeft} size="sm" color={text} />
          </IconButton>
          <Wordmark />
          <IconButton accessibilityLabel="Scan">
            <AppIcon icon={QrCode} size="sm" color={text} />
          </IconButton>
        </View>

        <Section title="Display" only={only}>
          <Display variant="event">Sam &amp; Jo’s wedding</Display>
          <Display dim="are in use.">Both rolls</Display>
          <Display variant="roll">Nadia turns 30</Display>
        </Section>

        <Section title="Text and edge print" only={only}>
          <ThemedText className="text-body">Everyone’s photos land in the same place.</ThemedText>
          <ThemedText tone="muted" className="text-body">
            A free account runs two rolls at a time.
          </ThemedText>
          <EdgePrint>
            <EdgeValue>1.2</EdgeValue> / 3 GB · <EdgeValue>5h 42m</EdgeValue> left · <EdgeValue>24</EdgeValue> people
          </EdgePrint>
          <EdgePrint size="frame-label">144 · Leila</EdgePrint>
          <PencilNote>free on 14 Nov ↑</PencilNote>
        </Section>

        <Section title="Leaders" only={only}>
          <Button title="Load the roll" mark="▸" />
          <Button title="Keep them" variant="outline" mark="‹" />
          <Button title="Cut and remove 148" variant="danger" mark="▸" />
          <Button title="Not now" variant="ghost" />
          <Button title="Saving" isLoading />
          <Button title="Load the roll" mark="▸" disabled />
        </Section>

        <Section title="Icon buttons" only={only}>
          <View className="flex-row gap-3">
            <IconButton accessibilityLabel="Back">
              <AppIcon icon={CaretLeft} size="sm" color={text} />
            </IconButton>
            <IconButton accessibilityLabel="More">
              <AppIcon icon={DotsThree} size="sm" color={text} />
            </IconButton>
          </View>
        </Section>

        <Section title="Grease pencil" only={only}>
          <View className="flex-row flex-wrap gap-4">
            {MARKS.map((mark, index) => (
              <View key={mark} className="items-center gap-2">
                <View className="h-16 w-24 items-center justify-center bg-frame-empty">
                  <GreasePencil mark={mark} width={96} height={64} seed={index + 1} drawOn />
                </View>
                <EdgePrint size="frame-label">{mark}</EdgePrint>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default DesignKitScreen;
