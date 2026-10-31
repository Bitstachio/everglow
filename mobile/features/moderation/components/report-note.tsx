import { colorTokens } from "@/theme/tokens";
import { TextInput, View } from "react-native";

type ReportNoteProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  maxLength: number;
};

/** A short note written on the ticket in ink, on its own ruled line (10.2). */
export const ReportNote = ({ value, onChangeText, placeholder, accessibilityLabel, maxLength }: ReportNoteProps) => (
  <View className="border-b border-paper-rule pb-1 pl-6">
    <TextInput
      testID="report-note"
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colorTokens.paperInk2}
      accessibilityLabel={accessibilityLabel}
      maxLength={maxLength}
      multiline
      autoFocus
      className="min-h-11 font-hand text-filled-in text-ink-blue"
    />
  </View>
);
