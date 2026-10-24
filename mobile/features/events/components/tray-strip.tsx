import { developLook } from "@/components/ui/contact-frame";
import { Sprockets } from "@/components/ui/film-strip";
import { Photo } from "@/components/ui/photo";
import { View } from "react-native";

export type TrayStripFrame = { key: string; uri: string; develop: number };

/**
 * 08.3: the first few photos in the tray on a strip of film, each as far
 * developed as its upload. A preview only, so hidden from assistive tech: the
 * rows under it say the same in words.
 */
export const TrayStrip = ({ frames }: { frames: TrayStripFrame[] }) => (
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="bg-rebate py-3.25">
    <Sprockets edge="top" />
    <View className="flex-row gap-1 px-1">
      {frames.map((frame) => {
        const look = developLook(frame.develop);
        return (
          <View key={frame.key} className="aspect-11/9 flex-1 overflow-hidden rounded-frame bg-frame-empty">
            <Photo
              source={{ uri: frame.uri }}
              contentFit="cover"
              blurRadius={look.blurRadius || undefined}
              className="h-full w-full"
            />
            {look.castOpacity > 0 ? (
              <View className="absolute inset-0 bg-developer" style={{ opacity: look.castOpacity }} />
            ) : null}
          </View>
        );
      })}
    </View>
    <Sprockets edge="bottom" />
  </View>
);
