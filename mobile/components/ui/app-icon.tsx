import { IconSize, type IconSizeName } from "@/constants/icons";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

type IconComponentProps = SvgProps & {
  size?: number;
  className?: string;
};

type AppIconProps = Omit<IconComponentProps, "width" | "height" | "size"> & {
  /** A Phosphor icon (the contact-sheet set), a Lucide icon, or a custom SVG. */
  icon: ComponentType<IconComponentProps> | PhosphorIcon;
  size?: IconSizeName | number;
};

/**
 * Shared size/tint wrapper for Lucide icons and custom SVGs.
 * Prefer NativeWind `className="text-*"` with the default `color="currentColor"`
 * instead of reading hex from `colorTokens`.
 */
export const AppIcon = ({ icon, size = "md", color = "currentColor", className, ...props }: AppIconProps) => {
  const Icon = icon as ComponentType<IconComponentProps>;
  const px = typeof size === "number" ? size : IconSize[size];

  return <Icon width={px} height={px} size={px} color={color} className={className} {...props} />;
};
