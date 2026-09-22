import { Spinner } from "@/components/ui/spinner";
import { Pressable, Text, type PressableProps } from "react-native";

type ButtonVariant = "primary" | "secondary" | "outline";

type ButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
  fullWidth?: boolean;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent active:bg-accent-active",
  secondary: "bg-surface active:bg-border",
  outline: "border border-border bg-transparent active:bg-surface",
};

const LABEL_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-accent-foreground",
  secondary: "text-foreground",
  outline: "text-foreground",
};

export const Button = ({
  title,
  variant = "primary",
  isLoading = false,
  fullWidth = true,
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
        "h-12 items-center justify-center rounded-2xl px-4",
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
        <Text className={`text-base font-semibold ${LABEL_CLASSES[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
};
