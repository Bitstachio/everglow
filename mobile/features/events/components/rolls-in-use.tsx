import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

type RollsInUseProps = {
  /** "Free plan · 2 of 2 running". */
  edge: string;
  /** "Both rolls". */
  title: string;
  /** "are in use." */
  dim: string;
  /** What the plan runs, and which roll frees a spot and when. */
  body: ReactNode;
  /** A film strip for each roll in use. */
  children: ReactNode;
};

/** 04.8 Every roll the plan allows is running: shown instead of the new-roll form. */
export const RollsInUse = ({ edge, title, dim, body, children }: RollsInUseProps) => (
  <ScrollView className="flex-1" contentContainerClassName="pb-6 pt-5">
    <View className="px-5">
      <EdgePrint>{edge}</EdgePrint>
      <Display className="mt-3" dim={dim}>
        {title}
      </Display>
      <Text className="mt-3 font-sans text-body text-text-2">{body}</Text>
    </View>
    <View className="mt-25 gap-3.5">{children}</View>
  </ScrollView>
);
