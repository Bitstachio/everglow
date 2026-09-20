import { IconSize } from "@/constants/icons";
import { render } from "@testing-library/react-native";
import type { SvgProps } from "react-native-svg";
import { View } from "react-native";
import { AppIcon } from "./app-icon";

const MockSvg = ({ width, height, color }: SvgProps) => (
  <View testID="mock-svg" accessibilityLabel={`${width}x${height}:${String(color)}`} />
);

describe("AppIcon", () => {
  it("defaults to the md token", async () => {
    const { getByTestId } = await render(<AppIcon icon={MockSvg} color="#111827" />);

    expect(getByTestId("mock-svg")).toHaveProp(
      "accessibilityLabel",
      `${IconSize.md}x${IconSize.md}:#111827`,
    );
  });

  it("resolves named sizes", async () => {
    const { getByTestId } = await render(<AppIcon icon={MockSvg} size="lg" color="#111827" />);

    expect(getByTestId("mock-svg")).toHaveProp(
      "accessibilityLabel",
      `${IconSize.lg}x${IconSize.lg}:#111827`,
    );
  });

  it("allows a numeric size override", async () => {
    const { getByTestId } = await render(<AppIcon icon={MockSvg} size={28} color="#111827" />);

    expect(getByTestId("mock-svg")).toHaveProp("accessibilityLabel", "28x28:#111827");
  });
});
