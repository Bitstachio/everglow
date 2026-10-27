import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { PencilNote } from "@/components/ui/pencil-note";
import { Shutter } from "@/components/ui/shutter";
import { useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";

/**
 * What sits at the foot of the roll:
 * - leader: one leader, such as "Send the envelope" (07.1)
 * - shutter: Save all · shutter · Invite or People (07.4–07.8)
 * - locked: the shutter locked, with why (07.2, 07.10)
 * - viewOnly: Save all · a note · People (07.7)
 * - text: a single text button on the right, such as "Cut the roll" (07.11)
 */
export type RollFooterProps =
  | { kind: "leader"; title: string; mark: string; onPress: () => void }
  | {
      kind: "shutter";
      shutterLabel: string;
      /** Edge print under the shutter while photos develop. */
      progress?: string;
      busy: boolean;
      onShutter: () => void;
      save: FooterAction;
      right: FooterAction;
      /** Circle the shutter: the first shot (07.4) and the last day (07.8). */
      circled?: boolean;
      /** "first shot's yours ↓" over the shutter (07.4). */
      note?: string;
    }
  | { kind: "locked"; label: string; accessibilityLabel: string; save?: FooterAction }
  | { kind: "viewOnly"; note: string; save: FooterAction; right: FooterAction }
  | { kind: "text"; action: FooterAction }
  | { kind: "none" };

type RollFooterOwnProps = { bottomInset: number };

export type FooterAction = { title: string; accessibilityLabel: string; onPress: () => void; disabled?: boolean };

const FOOT_HEIGHT = 190;

// The sheet fades out under the controls, as on a lightbox.
const BottomFade = () => (
  <View
    pointerEvents="none"
    className="absolute bottom-0 left-0 right-0"
    style={{
      height: FOOT_HEIGHT,
      experimental_backgroundImage: "linear-gradient(to bottom, rgba(14,14,14,0) 0%, rgba(14,14,14,0.94) 55%)",
    }}
  />
);

const TextAction = ({ action }: { action: FooterAction }) => (
  <Button
    variant="ghost"
    fullWidth={false}
    title={action.title}
    accessibilityLabel={action.accessibilityLabel}
    onPress={action.onPress}
    disabled={action.disabled}
  />
);

/** Save all on the left, something on the right, and what's between them. */
const Row = ({ left, middle, right }: { left?: ReactNode; middle: ReactNode; right?: ReactNode }) => (
  <View className="flex-row items-end justify-between px-3">
    <View className="flex-1 items-start pb-4">{left}</View>
    {middle}
    <View className="flex-1 items-end pb-4">{right}</View>
  </View>
);

// How far the pencil ring reaches past the shutter.
const RING_MARGIN = 12;

/** The shutter, circled in pencil when it's the one thing to do. Sized from its own layout, so the ring stays centred. */
const CircledShutter = ({ circled, children }: { circled: boolean; children: ReactNode }) => {
  const [size, setSize] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setSize(Math.round(event.nativeEvent.layout.width));

  return (
    <View className="items-center" onLayout={circled ? onLayout : undefined}>
      {children}
      {circled && size > 0 ? (
        <View className="absolute" style={{ left: -RING_MARGIN, top: -RING_MARGIN }}>
          <GreasePencil mark="ring" width={size + 2 * RING_MARGIN} height={size + 2 * RING_MARGIN} seed={11} drawOn />
        </View>
      ) : null}
    </View>
  );
};

export const RollFooter = ({ bottomInset, ...props }: RollFooterProps & RollFooterOwnProps) => {
  if (props.kind === "none") return null;

  return (
    <View pointerEvents="box-none" className="absolute bottom-0 left-0 right-0">
      <BottomFade />
      <View style={{ paddingBottom: bottomInset + 8 }}>
        {props.kind === "leader" ? (
          <View className="px-5 pb-4">
            <Button title={props.title} mark={props.mark} onPress={props.onPress} />
          </View>
        ) : null}

        {props.kind === "shutter" ? (
          <>
            {props.note ? (
              <View className="mb-2 items-center">
                <PencilNote>{props.note}</PencilNote>
              </View>
            ) : null}
            <Row
              left={<TextAction action={props.save} />}
              middle={
                <View className="items-center gap-2">
                  <CircledShutter circled={props.circled ?? false}>
                    <Shutter accessibilityLabel={props.shutterLabel} disabled={props.busy} onPress={props.onShutter} />
                  </CircledShutter>
                  <EdgePrint tone="text" className="h-4">
                    {props.progress ?? ""}
                  </EdgePrint>
                </View>
              }
              right={<TextAction action={props.right} />}
            />
          </>
        ) : null}

        {props.kind === "locked" ? (
          // The reason runs under the whole row, so a long one never squeezes Save all.
          <View className="gap-2">
            <Row
              left={props.save ? <TextAction action={props.save} /> : null}
              middle={<Shutter accessibilityLabel={props.accessibilityLabel} locked />}
            />
            <EdgePrint className="text-center">{props.label}</EdgePrint>
          </View>
        ) : null}

        {props.kind === "viewOnly" ? (
          <View className="gap-1 pb-4">
            <View className="flex-row items-center justify-between px-3">
              <TextAction action={props.save} />
              <TextAction action={props.right} />
            </View>
            <EdgePrint className="text-center">{props.note}</EdgePrint>
          </View>
        ) : null}

        {props.kind === "text" ? (
          <View className="items-end px-3 pb-4">
            <TextAction action={props.action} />
          </View>
        ) : null}
      </View>
    </View>
  );
};
