import "../testing/native-mocks";
import { render, screen, userEvent } from "@testing-library/react-native";
import { buildEvent } from "../testing/fixtures";
import { EventCard } from "./event-card";

test("renders event details and date/time in the device timezone", async () => {
  const when = new Date(2026, 8, 20, 15, 30);
  const event = buildEvent({ date: when.toISOString() });
  const onPress = jest.fn();
  await render(<EventCard event={event} onPress={onPress} />);
  expect(screen.getByText(event.title)).toBeOnTheScreen();
  expect(screen.getByText(event.description!)).toBeOnTheScreen();
  expect(screen.getByText("Sun, 20 Sep • 15:30")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: `Open ${event.title}` }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("keeps the year on the card when the event is outside the current year", async () => {
  const when = new Date(2025, 8, 20, 15, 30);
  await render(<EventCard event={buildEvent({ date: when.toISOString() })} onPress={jest.fn()} />);
  expect(screen.getByText("Sat, 20 Sep 2025 • 15:30")).toBeOnTheScreen();
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

test.each([
  ["https://bucket.example.com/event-covers/event-1/upload-1?sig=a", true],
  [null, false],
])("shows the cover %s only when the event has one", async (coverUrl, shown) => {
  await render(<EventCard event={buildEvent({ coverUrl })} onPress={jest.fn()} />);
  expect(screen.queryByTestId("event-cover-image", { includeHiddenElements: true }) !== null).toBe(shown);
});
