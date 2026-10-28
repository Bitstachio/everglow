import { Paper } from "@/components/ui/lab-paper";
import { colorTokens } from "@/theme/tokens";
import { forwardRef, type ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

type RollLabelProps = Pick<
  TextInputProps,
  "value" | "onChangeText" | "onBlur" | "onSubmitEditing" | "editable" | "placeholder"
> & {
  /** The film stock printed on the label, "Everglow 400". */
  stock: string;
  nameA11y: string;
  /** The cover, on the right beside the name. */
  cover?: ReactNode;
};

/** 04.1–04.2 and 04.5 The roll's label: its name written in, and its cover. */
export const RollLabel = forwardRef<TextInput, RollLabelProps>(({ stock, nameA11y, cover, ...input }, ref) => (
  <Paper className="flex-row items-center gap-3">
    <View className="flex-1">
      <Text className="font-mono-semibold text-edge-print uppercase text-paper-ink">{stock}</Text>
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
        className="mt-3 p-0 font-display text-input-roll text-paper-ink"
        // In points: h-8 renders at 28 (EV-165), short of the 30px name.
        style={{ height: 38 }}
      />
    </View>
    {cover}
  </Paper>
));
RollLabel.displayName = "RollLabel";
