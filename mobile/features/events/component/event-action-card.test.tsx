import { mockColorScheme } from "../testing/native-mocks";
import { render, screen, userEvent } from "@testing-library/react-native";
import EventActionCard from "./event-action-card";

test.each(["light", "dark"])("renders and activates actions in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  const onPress = jest.fn();
  await render(<EventActionCard title="Create Event" description="Host your own meetup" onPress={onPress} />);
  expect(screen.getByText("Host your own meetup")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Create Event" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
