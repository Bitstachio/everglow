import { Paper } from "@/components/ui/lab-paper";
import { colorTokens } from "@/theme/tokens";
import { forwardRef } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

type RollLabelProps = Pick<
  TextInputProps,
  "value" | "onChangeText" | "onBlur" | "onSubmitEditing" | "editable" | "placeholder"
> & {
  /** The film stock printed on the label, "Everglow 400". */
  stock: string;
  nameA11y: string;
  /** "Tonight · 20:00". */
  when: string;
  /** "edit ›" after the time; left out while the time is being picked. */
  editLabel?: string;
  editA11y: string;
  onEditWhen: () => void;
};

/** 04.1–04.3 The roll's label: its name written in, and when it happens. */
export const RollLabel = forwardRef<TextInput, RollLabelProps>(
  ({ stock, nameA11y, when, editLabel, editA11y, onEditWhen, ...input }, ref) => (
    <Paper>
      <View className="flex-row justify-between">
        <Text className="font-mono-semibold text-edge-print uppercase text-paper-ink">{stock}</Text>
      </View>
      <TextInput
        ref={ref}
        {...input}
        accessibilityLabel={nameA11y}
        placeholderTextColor={colorTokens.paperInk2}
        autoCapitalize="sentences"
        returnKeyType="next"
        submitBehavior="submit"
        maxLength={100}
        keyboardAppearance="dark"
        selectionColor={colorTokens.pencil}
        cursorColor={colorTokens.pencil}
        className="mb-1 mt-3 h-8 p-0 font-display text-input-roll text-paper-ink"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editA11y}
        hitSlop={12}
        onPress={onEditWhen}
        className="self-start active:opacity-60"
      >
        <Text className="font-mono text-edge-print uppercase text-paper-ink-2">
          {editLabel ? `${when} · ${editLabel}` : when}
        </Text>
      </Pressable>
    </Paper>
  ),
);
RollLabel.displayName = "RollLabel";
