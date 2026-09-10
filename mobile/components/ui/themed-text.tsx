import { textColors } from "@/tailwind.config";
import { ReactNode } from "react";
import { Text } from "react-native";

export type TextColorType = keyof typeof textColors;

type ThemedTextProps = {
  children: ReactNode;
  className?: string;
  textColor?: TextColorType;
};

export const ThemedText = ({ children, className = "", textColor = "main" }: ThemedTextProps) => (
  <Text className={`text-text-${textColor} dark:text-dark-text-${textColor} ${className}`}>{children}</Text>
);
