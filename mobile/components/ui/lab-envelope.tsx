import { colorTokens } from "@/theme/tokens";
import { type ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { Paper, PaperBox, PaperField } from "./lab-paper";

type EnvelopeField = { label: string; value?: ReactNode };
type EnvelopeOption = { label: string; checked: boolean };

type LabEnvelopeProps = {
  /** Name, date, who's on the roll, pick-up date. Leave values out for a sealed envelope. */
  fields: EnvelopeField[];
  /** What the envelope admits, as printed boxes: "Adds photos", "View only". */
  options?: EnvelopeOption[];
  /** Edge print at the bottom left, for example "Sealed until you sign in". */
  footer?: string;
  /** The QR code, at the bottom right. */
  code?: ReactNode;
  /** Spoken summary of the envelope, since its parts are laid out visually. */
  accessibilityLabel: string;
};

/**
 * The invite: a photo-lab envelope filled in by hand. Every string comes from
 * the caller, translated. Put a `Stamp` beside it to repeat the button.
 */
export const LabEnvelope = ({ fields, options, footer, code, accessibilityLabel }: LabEnvelopeProps) => (
  // Flap and paper tilt as one, so the flap stays square on the paper's top edge.
  <View accessible accessibilityLabel={accessibilityLabel} className="-rotate-2 pt-3">
    <View className="absolute left-0 right-0 top-0 h-3.5">
      <Svg width="100%" height="100%" viewBox="0 0 100 14" preserveAspectRatio="none">
        <Polygon points="0,14 8,0 92,0 100,14" fill={colorTokens.paperFlap} />
      </Svg>
    </View>
    <Paper tilt={false}>
      <View className="pt-1">
        {fields.map((field) => (
          <PaperField key={field.label} label={field.label} value={field.value} />
        ))}
      </View>
      {options?.length ? (
        <View className="flex-row gap-4 pt-3">
          {options.map((option) => (
            <View key={option.label} className="flex-row items-center gap-1.5">
              <PaperBox checked={option.checked} />
              <Text className="font-mono text-edge-print uppercase text-paper-ink">{option.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {footer || code ? (
        <View className="flex-row items-end justify-between pt-3.5">
          <Text className="flex-1 font-mono text-edge-print uppercase text-paper-ink-2">{footer}</Text>
          {code}
        </View>
      ) : null}
    </Paper>
  </View>
);
