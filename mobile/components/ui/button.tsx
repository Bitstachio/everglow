import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, TouchableOpacityProps } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: "primary" | "secondary" | "outline";
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = ({
  title,
  variant = "primary",
  isLoading = false,
  fullWidth = true,
  disabled,
  ...props
}: ButtonProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const getButtonStyle = () => {
    const baseStyle = [styles.button, fullWidth && styles.fullWidth];

    if (disabled || isLoading) {
      return [...baseStyle, styles.buttonDisabled];
    }

    switch (variant) {
      case "secondary":
        return [...baseStyle, isDark ? styles.buttonSecondaryDark : styles.buttonSecondaryLight];
      case "outline":
        return [...baseStyle, isDark ? styles.buttonOutlineDark : styles.buttonOutlineLight];
      default:
        return [...baseStyle, isDark ? styles.buttonPrimaryDark : styles.buttonPrimaryLight];
    }
  };

  const getTextStyle = () => {
    if (disabled || isLoading) {
      return [styles.text, styles.textDisabled];
    }

    switch (variant) {
      case "secondary":
        return [styles.text, isDark ? styles.textSecondaryDark : styles.textSecondaryLight];
      case "outline":
        return [styles.text, isDark ? styles.textOutlineDark : styles.textOutlineLight];
      default:
        return [styles.text, styles.textPrimary];
    }
  };

  return (
    <TouchableOpacity style={getButtonStyle()} disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <ActivityIndicator color={variant === "outline" ? "#6366F1" : "#FFF"} />
      ) : (
        <Text style={getTextStyle()}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  fullWidth: {
    width: "100%",
  },
  buttonPrimaryLight: {
    backgroundColor: "#6366F1",
  },
  buttonPrimaryDark: {
    backgroundColor: "#4F46E5",
  },
  buttonSecondaryLight: {
    backgroundColor: "#E5E7EB",
  },
  buttonSecondaryDark: {
    backgroundColor: "#374151",
  },
  buttonOutlineLight: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#6366F1",
  },
  buttonOutlineDark: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#818CF8",
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
  textPrimary: {
    color: "#FFFFFF",
  },
  textSecondaryLight: {
    color: "#1F2937",
  },
  textSecondaryDark: {
    color: "#F3F4F6",
  },
  textOutlineLight: {
    color: "#6366F1",
  },
  textOutlineDark: {
    color: "#818CF8",
  },
  textDisabled: {
    color: "#D1D5DB",
  },
});
