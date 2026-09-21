import { SymbolView, SymbolWeight } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { StyleProp, ViewStyle } from "react-native";

export const IconSymbol = ({
  name,
  size = 24,
  color,
  style,
  weight = "regular",
}: {
  name: SFSymbol;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) => {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
};
