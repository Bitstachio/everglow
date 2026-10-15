import { type ReactNode } from "react";
import { View } from "react-native";
import { Paper, PaperField, PaperHead } from "./lab-paper";
import { Photo } from "./photo";

type LabCardProps = {
  /** The printed head, for example "Lab card · since Oct 2026". */
  title: string;
  /** The person's photo. */
  photoUri?: string;
  /** Name, username, plan: printed labels with values in hand. */
  fields: { label: string; value?: ReactNode }[];
  accessibilityLabel: string;
};

/** Your account, as a lab card: photo on the left, details filled in by hand. */
export const LabCard = ({ title, photoUri, fields, accessibilityLabel }: LabCardProps) => (
  <View accessible accessibilityLabel={accessibilityLabel}>
    <Paper>
      <View className="flex-row gap-3.5">
        <View className="h-28 w-23 overflow-hidden rounded-frame bg-paper-flap">
          {photoUri ? <Photo source={{ uri: photoUri }} contentFit="cover" className="h-full w-full" /> : null}
        </View>
        <View className="flex-1">
          <PaperHead title={title} />
          {fields.map((field) => (
            <PaperField key={field.label} label={field.label} value={field.value} />
          ))}
        </View>
      </View>
    </Paper>
  </View>
);
