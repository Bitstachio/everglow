import { IconSize, type IconSizeName } from "@/constants/icons";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

type IconComponentProps = SvgProps & {
  size?: number;
  className?: string;
};

type AppIconProps = Omit<IconComponentProps, "width" | "height" | "size"> & {
  icon: ComponentType<IconComponentProps>;
  size?: IconSizeName | number;
};

/**
 * Shared size/tint wrapper for Lucide icons and custom SVGs.
 * Prefer NativeWind `className="text-*"` with the default `color="currentColor"`
 * instead of reading hex from `colorTokens`.
 */
export const AppIcon = ({ icon: Icon, size = "md", color = "currentColor", className, ...props }: AppIconProps) => {
  const px = typeof size === "number" ? size : IconSize[size];

  return <Icon width={px} height={px} size={px} color={color} className={className} {...props} />;
};
