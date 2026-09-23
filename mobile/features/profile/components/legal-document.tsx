import { H3 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { ScrollView, View } from "react-native";

export type LegalSection = {
  heading: string;
  body: string;
};

type LegalDocumentProps = {
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export const LegalDocument = ({ intro, lastUpdated, sections }: LegalDocumentProps) => (
  <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pt-4 pb-6">
    <View className="gap-2">
      <ThemedText className="text-base">{intro}</ThemedText>
      <ThemedText tone="subtle" className="text-xs">
        Last updated {lastUpdated}
      </ThemedText>
    </View>
    {sections.map((section) => (
      <View key={section.heading} className="gap-2">
        <H3>{section.heading}</H3>
        <ThemedText tone="muted" className="text-sm">
          {section.body}
        </ThemedText>
      </View>
    ))}
  </ScrollView>
);
