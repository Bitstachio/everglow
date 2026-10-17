import { colorTokens } from "@/theme/tokens";
import { Camera } from "phosphor-react-native";
import { type ReactNode } from "react";
import { Text, View } from "react-native";
import { Paper, PaperHead } from "./lab-paper";
import { Monochrome } from "./monochrome";
import { Photo } from "./photo";

type LabCardProps = {
  /** The printed head, for example "Lab card · since Oct 2026". */
  title: string;
  /** The person's photo, shown in black and white. Without one, a camera marks the empty spot. */
  photoUri?: string;
  /** Name, username, plan: printed labels with values in hand. */
  fields: { label: string; value?: ReactNode }[];
  accessibilityLabel: string;
};

/** Your account, as a lab card: photo on the left, details filled in by hand below printed labels. */
export const LabCard = ({ title, photoUri, fields, accessibilityLabel }: LabCardProps) => (
  <View accessible accessibilityLabel={accessibilityLabel}>
    <Paper tilt="slight">
      <View className="flex-row gap-3.5">
        <View className="h-28 w-23 items-center justify-center overflow-hidden rounded-frame bg-paper-flap">
          {photoUri ? (
            // Black and white on the card; photos on rolls stay in colour.
            <Monochrome className="h-full w-full">
              <Photo source={{ uri: photoUri }} contentFit="cover" className="h-full w-full" />
            </Monochrome>
          ) : (
            <Camera size={22} color={colorTokens.paperInk2} />
          )}
        </View>
        <View className="flex-1">
          <PaperHead title={title} />
          <View className="mt-2 gap-1.5">
            {fields.map((field) => (
              <View key={field.label}>
                <Text className="font-mono text-frame-label uppercase text-paper-ink-2">{field.label}</Text>
                <Text numberOfLines={1} className="font-hand text-filled-in-card text-ink-blue">
                  {field.value ?? " "}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Paper>
  </View>
);
