import { GreasePencil } from "@/components/ui/grease-pencil";
import { useState } from "react";
import { Pressable, Text, View, type LayoutRectangle } from "react-native";

type UsernameSuggestionsProps = {
  suggestions: string[];
  onPick: (username: string) => void;
  /** "Use @maya.chen", for assistive tech. */
  pickLabel: (username: string) => string;
};

// The ring overshoots the chip so it reads as drawn around it, not on it.
const RING_X = 8;
const RING_Y = 7;

/** Free usernames to tap, the closest ringed in pencil. */
export const UsernameSuggestions = ({ suggestions, onPick, pickLabel }: UsernameSuggestionsProps) => {
  const [first, setFirst] = useState<Pick<LayoutRectangle, "width" | "height"> | null>(null);

  return (
    <View className="flex-row flex-wrap gap-2">
      {suggestions.map((username, index) => (
        <View key={username} onLayout={index === 0 ? (event) => setFirst(event.nativeEvent.layout) : undefined}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pickLabel(username)}
            onPress={() => onPick(username)}
            hitSlop={5}
            className="h-8.5 justify-center rounded-paper border border-outline-soft px-3 active:bg-sheet"
          >
            <Text className="font-mono text-text-button text-text">@{username}</Text>
          </Pressable>
          {index === 0 && first ? (
            <View className="absolute" style={{ left: -RING_X, top: -RING_Y }} pointerEvents="none">
              <GreasePencil
                mark="ring"
                width={first.width + 2 * RING_X}
                height={first.height + 2 * RING_Y}
                strokeWidth={2.5}
                seed={4}
                drawOn
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
};
