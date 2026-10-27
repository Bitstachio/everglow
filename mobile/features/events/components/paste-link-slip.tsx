import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { Slip } from "@/components/ui/slip";
import { colorTokens } from "@/theme/tokens";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";

type PasteLinkSlipProps = {
  edge: string;
  title: string;
  label: string;
  placeholder: string;
  /** "Found on your clipboard", when the link came from there. */
  note?: string;
  openLabel: string;
  value: string;
  canOpen: boolean;
  onChangeText: (value: string) => void;
  onOpen: () => void;
};

/**
 * 06.2 Paste a link: a slip with one link on a ruled line, in Funnel Display
 * with a pencil caret. Put it in a `BottomSheet` without a title. It rides
 * above the keyboard while the link is typed.
 */
export const PasteLinkSlip = ({
  edge,
  title,
  label,
  placeholder,
  note,
  openLabel,
  value,
  canOpen,
  onChangeText,
  onOpen,
}: PasteLinkSlipProps) => (
  <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <Slip edge={edge} title={title}>
      <View className={`border-b-2 pb-2 ${value ? "border-text" : "border-outline-soft"}`}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={canOpen ? onOpen : undefined}
          accessibilityLabel={label}
          placeholder={placeholder}
          placeholderTextColor={colorTokens.outline}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          keyboardAppearance="dark"
          selectionColor={colorTokens.pencil}
          cursorColor={colorTokens.pencil}
          className="h-7 p-0 font-display text-lg text-text"
        />
      </View>
      {note ? <EdgePrint className="mb-2">{note}</EdgePrint> : null}
      <Button title={openLabel} mark="▸" onPress={onOpen} disabled={!canOpen} />
    </Slip>
  </KeyboardAvoidingView>
);
