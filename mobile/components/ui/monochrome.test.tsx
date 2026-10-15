import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Monochrome } from "./monochrome";

test("shows its content under the blend layer", async () => {
  await render(
    <Monochrome>
      <Text>Frame 12</Text>
    </Monochrome>,
  );
  expect(screen.getByText("Frame 12")).toBeOnTheScreen();
});
