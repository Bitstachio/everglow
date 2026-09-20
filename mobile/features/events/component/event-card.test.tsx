import "../testing/native-mocks";
import { render, screen, userEvent } from "@testing-library/react-native";
import { buildEvent } from "../testing/fixtures";
import EventCard from "./event-card";

test("renders event details and date/time in the device timezone", async () => {
  const event = buildEvent({ date: new Date(2026, 8, 20, 15, 30).toISOString() });
  const onPress = jest.fn();
  await render(<EventCard event={event} onPress={onPress} />);
  expect(screen.getByText(event.title)).toBeOnTheScreen();
  expect(screen.getByText(event.description!)).toBeOnTheScreen();
  expect(screen.getByText("Sep 20, 2026 • 3:30 PM")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: `Open ${event.title}` }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each([null, ""])("supports an event with description %s", async (description) => {
  await render(<EventCard event={buildEvent({ description })} onPress={jest.fn()} />);
  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.queryByText("An afternoon with friends")).not.toBeOnTheScreen();
});

test("sharing invokes only the share callback", async () => {
  const onPress = jest.fn();
  const onShare = jest.fn();
  await render(<EventCard event={buildEvent()} onPress={onPress} onShare={onShare} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Share Weekend meetup" }));
  expect(onShare).toHaveBeenCalledTimes(1);
  expect(onPress).not.toHaveBeenCalled();
});
