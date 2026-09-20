import { IconSize, type IconSizeName } from "@/constants/icons";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

type AppIconProps = Omit<SvgProps, "width" | "height"> & {
  icon: ComponentType<SvgProps>;
  size?: IconSizeName | number;
};

export const AppIcon = ({ icon: Icon, size = "md", color, ...props }: AppIconProps) => {
  const px = typeof size === "number" ? size : IconSize[size];

  return <Icon width={px} height={px} color={color} {...props} />;
};
