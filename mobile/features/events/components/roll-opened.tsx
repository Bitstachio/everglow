import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { FrameCounter } from "@/components/ui/frame-counter";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";

type RollOpenedProps = {
  title: string;
  isOpenLine: string;
  edge: string;
  count: number;
  counterLabel: string;
  counterAccessibilityLabel: string;
  backLabel: string;
  /** "Add the first photos", or "Look at the roll" for view-only guests. */
  action: { title: string; mark: string; onPress: () => void };
  onBack: () => void;
};

/**
 * 07.3 It opens: shown once, on the first visit after the roll opened. The
 * counter is the roll's frames so far.
 */
export const RollOpened = ({
  title,
  isOpenLine,
  edge,
  count,
  counterLabel,
  counterAccessibilityLabel,
  backLabel,
  action,
  onBack,
}: RollOpenedProps) => {
  // The dial is square and as wide as the counter; its label sits under it.
  const [dial, setDial] = useState(0);
  const onDialLayout = (event: LayoutChangeEvent) => setDial(Math.round(event.nativeEvent.layout.width));

  return (
    <SafeAreaView testID="roll-opened" className="flex-1 bg-ground">
      <TopBar left={<BackButton accessibilityLabel={backLabel} onPress={onBack} />} />
      <View className="flex-1 items-center justify-center gap-9 px-5">
        <View onLayout={onDialLayout}>
          <FrameCounter count={count} label={counterLabel} accessibilityLabel={counterAccessibilityLabel} />
          {dial > 0 ? (
            // Around the counter's window, centred on the dial whatever its rendered size.
            <View
              className="absolute"
              style={{ left: dial * 0.2, top: dial * 0.275, width: dial * 0.6, height: dial * 0.45 }}
            >
              <GreasePencil mark="ring" width={dial * 0.6} height={dial * 0.45} seed={4} drawOn />
            </View>
          ) : null}
        </View>
        <View className="items-center gap-4">
          <Display className="text-center" dim={isOpenLine}>
            {title}
          </Display>
          <EdgePrint className="text-center">{edge}</EdgePrint>
        </View>
      </View>
      <View className="px-5 pb-4">
        <Button title={action.title} mark={action.mark} onPress={action.onPress} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};
