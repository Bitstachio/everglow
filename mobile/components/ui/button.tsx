import { AppIcon } from "@/components/ui/app-icon";
import { Spinner } from "@/components/ui/spinner";
import type { ComponentProps } from "react";
import { Pressable, Text, type PressableProps } from "react-native";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

type ButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
  fullWidth?: boolean;
  /** Optional leading icon, tinted to match the label. */
  icon?: ComponentProps<typeof AppIcon>["icon"];
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent active:bg-accent-active",
  secondary: "bg-surface active:bg-border",
  outline: "border border-border bg-transparent active:bg-surface",
  ghost: "bg-transparent active:bg-surface",
};

const LABEL_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-accent-foreground",
  secondary: "text-foreground",
  outline: "text-foreground",
  ghost: "text-muted",
};

export const Button = ({
  title,
  variant = "primary",
  isLoading = false,
  fullWidth = true,
  icon,
  disabled = false,
  className = "",
  accessibilityLabel,
  ...props
}: ButtonProps) => {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      className={[
        "h-12 flex-row items-center justify-center gap-2 rounded-2xl px-4",
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
        <Spinner tone={variant === "primary" ? "accentForeground" : "accent"} label="Loading" />
      ) : (
        <>
          {icon ? <AppIcon icon={icon} size="sm" className={LABEL_CLASSES[variant]} /> : null}
          <Text className={`text-base font-semibold ${LABEL_CLASSES[variant]}`}>{title}</Text>
        </>
      )}
    </Pressable>
  );
};
