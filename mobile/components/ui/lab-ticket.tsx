import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { GreasePencil } from "./grease-pencil";
import { Paper, PaperHead } from "./lab-paper";

export type TicketOption = {
  key: string;
  label: string;
  checked: boolean;
  onPress?: () => void;
};

type LabTicketProps = {
  /** The printed head, for example "Report a frame". */
  title: string;
  number?: string;
  options: TicketOption[];
  /** A printed note that splits the options, for example the serious reasons. */
  divider?: { afterKey: string; label: string };
  /** Small print at the bottom, for example "Anonymous to hosts". */
  footer?: string;
  /** Written on the ticket after an option, such as a short note under "Something else". */
  writeIn?: { afterKey: string; content: ReactNode };
};

/**
 * A lab ticket: printed options ticked in pencil. Reporting uses it. Each
 * option is a checkbox for assistive tech.
 */
export const LabTicket = ({ title, number, options, divider, footer, writeIn }: LabTicketProps) => (
  <Paper tilt="right">
    <PaperHead title={title} number={number} />
    {options.map((option) => (
      <View key={option.key}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: option.checked }}
          accessibilityLabel={option.label}
          onPress={option.onPress}
          className="min-h-11 flex-row items-center gap-2.5 border-b border-paper-rule py-2.5"
        >
          <View className="size-3.5 border-2 border-paper-ink">
            {option.checked ? (
              <View className="absolute -left-1 -top-2">
                <GreasePencil mark="tick" width={22} height={20} strokeWidth={2.5} drawOn />
              </View>
            ) : null}
          </View>
          <Text className="flex-1 font-mono text-edge-print uppercase text-paper-ink">{option.label}</Text>
        </Pressable>
        {writeIn?.afterKey === option.key ? writeIn.content : null}
        {divider?.afterKey === option.key ? (
          <Text className="pb-0.5 pt-3 font-mono-semibold text-edge-print uppercase text-stamp">{divider.label}</Text>
        ) : null}
      </View>
    ))}
    {footer ? <Text className="pt-2.5 font-mono text-frame-label text-paper-ink-2">{footer}</Text> : null}
  </Paper>
);
