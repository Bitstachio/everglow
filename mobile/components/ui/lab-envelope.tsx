import { colorTokens } from "@/theme/tokens";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { GreasePencil } from "./grease-pencil";
import { Paper, PaperBox, PaperField } from "./lab-paper";
import { PencilNote } from "./pencil-note";

type EnvelopeField = { label: string; value?: ReactNode };
/** A printed box. With `onPress` it's a radio button: tapping it ticks that box. */
type EnvelopeOption = { label: string; checked: boolean; onPress?: () => void };

type LabEnvelopeProps = {
  /** Name, date, who's on the roll, pick-up date. Leave values out for a sealed envelope. */
  fields: EnvelopeField[];
  /** What the envelope admits, as printed boxes: "Adds photos", "View only". */
  options?: EnvelopeOption[];
  /** Written under the boxes in pencil, with an arrow up to the ticked one: what it lets people do. */
  note?: string;
  /** Edge print at the bottom, centred, for example "Sealed until you sign in". */
  footer?: string;
  /** The QR code, centred at the bottom. */
  code?: ReactNode;
  /** An action printed at the foot of the paper, under the code: a `PaperButton`. */
  action?: ReactNode;
  /** A `Stamp` on the paper's bottom right corner. */
  stamp?: ReactNode;
  /** Spoken summary of the filled-in envelope, since its parts are laid out visually. */
  accessibilityLabel: string;
};

/**
 * The invite: a photo-lab envelope filled in by hand. Every string comes from
 * the caller, translated. Put a `Stamp` beside it to repeat the button.
 */
export const LabEnvelope = ({
  fields,
  options,
  note,
  footer,
  code,
  action,
  stamp,
  accessibilityLabel,
}: LabEnvelopeProps) => {
  // Where each box sits, so the note's arrow can point at whichever is ticked.
  // Measured once: ticking a box doesn't move any of them.
  const [boxX, setBoxX] = useState<Record<string, number>>({});
  const tickedX = boxX[options?.find((option) => option.checked)?.label ?? ""] ?? 0;

  return (
    // Flap and paper tilt as one, so the flap stays square on the paper's top edge.
    <View className="-rotate-2 pt-3">
      <View className="absolute left-0 right-0 top-0 h-3.5">
        <Svg width="100%" height="100%" viewBox="0 0 100 14" preserveAspectRatio="none">
          <Polygon points="0,14 8,0 92,0 100,14" fill={colorTokens.paperFlap} />
        </Svg>
      </View>
      <Paper tilt={false}>
        {/* One summary for what's written in; the boxes stay separate so they can be tapped. */}
        <View accessible accessibilityLabel={accessibilityLabel} className="pt-1">
          {fields.map((field) => (
            <PaperField key={field.label} label={field.label} value={field.value} />
          ))}
        </View>
        {options?.length ? (
          <View
            accessibilityRole={options.some((option) => option.onPress) ? "radiogroup" : undefined}
            className="flex-row gap-4 pt-1"
          >
            {options.map((option) => (
              <Pressable
                key={option.label}
                disabled={!option.onPress}
                onPress={option.onPress}
                onLayout={(event) => {
                  const { x } = event.nativeEvent.layout;
                  setBoxX((measured) => ({ ...measured, [option.label]: x }));
                }}
                accessible={Boolean(option.onPress)}
                accessibilityRole={option.onPress ? "radio" : undefined}
                accessibilityState={option.onPress ? { checked: option.checked } : undefined}
                accessibilityLabel={option.label}
                className="min-h-11 flex-row items-center gap-1.5 active:opacity-60"
              >
                <PaperBox checked={option.checked} />
                <Text className="font-mono text-edge-print uppercase text-paper-ink">{option.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {note ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="-mt-2">
            {/* The arrow moves to the ticked box; the note stays at the left on one line, so both envelopes are the same height. */}
            <View testID="envelope-note" style={{ marginLeft: tickedX }}>
              <GreasePencil mark="arrow" width={20} height={34} from={[12, 32]} to={[5, 3]} bend={0.25} seed={5} />
            </View>
            <PencilNote numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {note}
            </PencilNote>
          </View>
        ) : null}
        {code ? <View className="items-center pb-2 pt-6">{code}</View> : null}
        {footer ? (
          <Text className="pt-6 text-center font-mono text-edge-print uppercase text-paper-ink-2">{footer}</Text>
        ) : null}
        {action ? <View className="pt-5">{action}</View> : null}
        {stamp ? <View className="-mb-2 -mr-2 items-end pt-4">{stamp}</View> : null}
      </Paper>
    </View>
  );
};
