import { IconSize } from "@/constants/icons";
import { render } from "@testing-library/react-native";
import type { SvgProps } from "react-native-svg";
import { View } from "react-native";
import { AppIcon } from "./app-icon";

const MockSvg = ({ width, height, color, className }: SvgProps & { className?: string }) => (
  <View
    testID="mock-svg"
    accessibilityLabel={`${width}x${height}:${String(color)}:${className ?? ""}`}
  />
);

describe("AppIcon", () => {
  it("defaults to the md token and currentColor", async () => {
    const { getByTestId } = await render(<AppIcon icon={MockSvg} />);

    expect(getByTestId("mock-svg")).toHaveProp(
      "accessibilityLabel",
      `${IconSize.md}x${IconSize.md}:currentColor:`,
    );
  });

  it("resolves named sizes and forwards NativeWind class names", async () => {
    const { getByTestId } = await render(<AppIcon icon={MockSvg} size="lg" className="text-muted" />);

    expect(getByTestId("mock-svg")).toHaveProp(
      "accessibilityLabel",
      `${IconSize.lg}x${IconSize.lg}:currentColor:text-muted`,
    );
  });

  it("allows a numeric size and explicit color override", async () => {
    const { getByTestId } = await render(<AppIcon icon={MockSvg} size={28} color="#111827" />);

    expect(getByTestId("mock-svg")).toHaveProp("accessibilityLabel", "28x28:#111827:");
  });
});
