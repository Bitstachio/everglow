import { colorTokens } from "@/theme/tokens";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Line, Polygon } from "react-native-svg";
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
  /** The QR code, centred at the bottom. */
  code?: ReactNode;
  /** An action printed at the foot of the paper, under the code: a `PaperButton`. */
  action?: ReactNode;
  /** A `Stamp` over the paper's bottom right corner. */
  stamp?: ReactNode;
  /** Dim the paper (a returned envelope); the stamp stays at full strength. */
  dimmed?: boolean;
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
  code,
  action,
  stamp,
  dimmed = false,
  accessibilityLabel,
}: LabEnvelopeProps) => {
  // Where each box sits, so the note's arrow can point at whichever is ticked.
  // Measured once: ticking a box doesn't move any of them.
  const [boxX, setBoxX] = useState<Record<string, number>>({});
  const tickedX = boxX[options?.find((option) => option.checked)?.label ?? ""] ?? 0;

  return (
    // Flap and paper tilt as one, so the flap stays square on the paper's top edge.
    <View className="-rotate-2">
      <View className={dimmed ? "pt-3 opacity-50" : "pt-3"}>
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
              {/* Ends before a stamp in the corner, the stamp's own width (size-24). */}
              <PencilNote
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                className={stamp ? "mr-24" : ""}
              >
                {note}
              </PencilNote>
            </View>
          ) : null}
          {code ? <View className="items-center pb-2 pt-6">{code}</View> : null}
          {action ? <View className="pt-5">{action}</View> : null}
        </Paper>
      </View>
      {/* Stamped over the bottom right corner, beside the note, hanging a little off the edge so it takes no
          row of its own and clears the last line. */}
      {stamp ? <View className="absolute -bottom-4 right-2">{stamp}</View> : null}
    </View>
  );
};

/**
 * The back of a sealed envelope: the flap folded down to a point with the
 * stamp sealing it, and nothing written on it. For an invite that opens only
 * once you sign in (06.3); the filled-in `LabEnvelope` is its front.
 */
export const LabEnvelopeBack = ({ stamp, accessibilityLabel }: { stamp?: ReactNode; accessibilityLabel: string }) => (
  <View
    accessible
    accessibilityLabel={accessibilityLabel}
    className="-rotate-2 overflow-hidden rounded-paper bg-paper shadow-paper"
    // An envelope's proportions, as the front's paper is about wide.
    style={{ aspectRatio: 1.6 }}
  >
    <View className="absolute inset-0">
      <Svg width="100%" height="100%" viewBox="0 0 160 100" preserveAspectRatio="none">
        {/* The side folds under the flap, meeting where the flap's point lands. */}
        <Line x1="0" y1="100" x2="80" y2="52" stroke={colorTokens.paperRule} strokeWidth="0.6" />
        <Line x1="160" y1="100" x2="80" y2="52" stroke={colorTokens.paperRule} strokeWidth="0.6" />
        <Polygon points="0,0 160,0 80,58" fill={colorTokens.paperFlap} />
      </Svg>
    </View>
    {/* The stamp seals the flap's point, like wax. */}
    {stamp ? <View className="absolute inset-0 items-center justify-center pt-6">{stamp}</View> : null}
  </View>
);
