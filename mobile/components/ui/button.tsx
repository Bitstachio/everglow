import { AppIcon } from "@/components/ui/app-icon";
import { Spinner } from "@/components/ui/spinner";
import i18n from "@/i18n/instance";
import { colorTokens, type ColorTokenName } from "@/theme/tokens";
import { Warning } from "phosphor-react-native";
import type { ComponentProps } from "react";
import { Pressable, Text, View, type PressableProps } from "react-native";

/**
 * - primary: the white leader, one per screen.
 * - secondary / outline: an outlined leader.
 * - danger: outlined in white with a warning icon. Name the consequence in
 *   the title ("Cut and remove 148"). Never strawberry.
 * - ghost: a text button in edge print.
 */
type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";

type ButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
  fullWidth?: boolean;
  /** Optional leading icon, tinted to match the label. */
  icon?: ComponentProps<typeof AppIcon>["icon"];
  /** A short glyph at the leader's right end: "▸", "‹", "✓", "↓". Decorative. */
  mark?: string;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "h-14.5 rounded-leader bg-leader px-5 active:bg-accent-active",
  secondary: "h-14.5 rounded-leader border border-outline bg-transparent px-5 active:bg-sheet",
  outline: "h-14.5 rounded-leader border border-outline bg-transparent px-5 active:bg-sheet",
  danger: "h-14.5 rounded-leader border-2 border-text bg-transparent px-5 active:bg-sheet",
  ghost: "h-11 bg-transparent px-2 active:opacity-60",
};

const LABEL_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-leader-label text-on-leader",
  secondary: "text-leader-label text-text",
  outline: "text-leader-label text-text",
  danger: "text-leader-label text-text",
  ghost: "text-text-button text-text",
};

const ICON_TOKEN: Record<ButtonVariant, ColorTokenName> = {
  primary: "onLeader",
  secondary: "text",
  outline: "text",
  danger: "text",
  ghost: "text",
};

/** The leader: a strip of film's end, 58pt tall, with a mono uppercase label. */
export const Button = ({
  title,
  variant = "primary",
  isLoading = false,
  fullWidth = true,
  icon,
  mark,
  disabled = false,
  className = "",
  accessibilityLabel,
  ...props
}: ButtonProps) => {
  const isDisabled = disabled || isLoading;
  const tint = colorTokens.dark[ICON_TOKEN[variant]];
  const leadingIcon = variant === "danger" ? Warning : icon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      className={[
        "flex-row items-center",
        variant === "ghost" ? "justify-center" : "justify-between",
        fullWidth ? "w-full" : "self-start",
        VARIANT_CLASSES[variant],
        isDisabled ? "opacity-50" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {isLoading ? (
        <View className="flex-1 items-center">
          <Spinner
            tone={variant === "primary" ? "accentForeground" : "accent"}
            label={i18n.t("actions.loading", { ns: "common" })}
          />
        </View>
      ) : (
        <>
          <View className="flex-row items-center gap-3">
            {leadingIcon ? <AppIcon icon={leadingIcon} size="sm" color={tint} /> : null}
            <Text className={`font-mono-semibold uppercase ${LABEL_CLASSES[variant]}`}>{title}</Text>
          </View>
          {mark && variant !== "ghost" ? (
            <Text
              importantForAccessibility="no"
              accessibilityElementsHidden
              className={`font-mono-semibold ${LABEL_CLASSES[variant]}`}
            >
              {mark}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
};
