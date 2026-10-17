import { Paper, PaperHead } from "@/components/ui/lab-paper";
import { Monochrome } from "@/components/ui/monochrome";
import { Photo } from "@/components/ui/photo";
import { Spinner } from "@/components/ui/spinner";
import { colorTokens } from "@/theme/tokens";
import { Camera } from "phosphor-react-native";
import { Text, TextInput, View, type TextInputProps } from "react-native";

type EditLabCardProps = Pick<TextInputProps, "value" | "onChangeText" | "onBlur" | "onSubmitEditing" | "editable"> & {
  title: string;
  photoUri?: string;
  isUpdatingPhoto: boolean;
  photoBusyLabel: string;
  nameLabel: string;
  namePlaceholder: string;
  nameA11y: string;
  usernameLabel: string;
  username: string;
};

/**
 * 14.2 The lab card with its name filled in by hand and open to edit. The
 * username stays printed: it changes on its own screen.
 */
export const EditLabCard = ({
  title,
  photoUri,
  isUpdatingPhoto,
  photoBusyLabel,
  nameLabel,
  namePlaceholder,
  nameA11y,
  usernameLabel,
  username,
  ...input
}: EditLabCardProps) => (
  <Paper tilt="slight">
    <View className="flex-row gap-3.5">
      <View className="h-28 w-23 items-center justify-center overflow-hidden rounded-frame bg-paper-flap">
        {isUpdatingPhoto ? (
          <Spinner label={photoBusyLabel} />
        ) : photoUri ? (
          <Monochrome className="h-full w-full">
            <Photo source={{ uri: photoUri }} contentFit="cover" className="h-full w-full" />
          </Monochrome>
        ) : (
          <Camera size={22} color={colorTokens.paperInk2} />
        )}
      </View>
      <View className="flex-1">
        <PaperHead title={title} />
        <View className="mt-2 gap-1.5">
          <View>
            <Text className="font-mono text-frame-label uppercase text-paper-ink-2">{nameLabel}</Text>
            <TextInput
              {...input}
              accessibilityLabel={nameA11y}
              placeholder={namePlaceholder}
              placeholderTextColor={colorTokens.paperInk2}
              autoFocus
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="done"
              maxLength={255}
              keyboardAppearance="dark"
              selectionColor={colorTokens.pencil}
              cursorColor={colorTokens.pencil}
              className="h-7 p-0 font-hand text-input-card text-ink-blue"
            />
          </View>
          <View>
            <Text className="font-mono text-frame-label uppercase text-paper-ink-2">{usernameLabel}</Text>
            <Text numberOfLines={1} className="font-hand text-filled-in-card text-ink-blue">
              {username}
            </Text>
          </View>
        </View>
      </View>
    </View>
  </Paper>
);
