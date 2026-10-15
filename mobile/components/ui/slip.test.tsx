import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Slip } from "./slip";

test("titles the slip as a header and keeps its actions", async () => {
  await render(
    <Slip edge="Frame 144" title="Delete it for everyone?" body="This can’t be undone.">
      <Text>Delete</Text>
    </Slip>,
  );
  expect(screen.getByRole("header", { name: "Delete it for everyone?" })).toBeOnTheScreen();
  expect(screen.getByText("This can’t be undone.")).toBeOnTheScreen();
  expect(screen.getByText("Delete")).toBeOnTheScreen();
});
