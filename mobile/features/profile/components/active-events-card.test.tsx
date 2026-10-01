import { render, screen, userEvent } from "@testing-library/react-native";
import type { UserLimitsResponseDto } from "../types";
import { ActiveEventsCard } from "./active-events-card";

const buildLimits = (overrides: Partial<UserLimitsResponseDto> = {}): UserLimitsResponseDto => ({
  plan: "FREE",
  limits: { activeEvents: 2 },
  usage: { activeEvents: 1 },
  nextClosingEvent: { id: "event-1", title: "Book Club", galleryClosesAt: "2026-10-20T12:00:00.000Z" },
  ...overrides,
});

const renderCard = (limits?: UserLimitsResponseDto) =>
  render(<ActiveEventsCard limits={limits} isLoading={false} isError={false} isFetching={false} onRetry={jest.fn()} />);

test("shows active events against the plan's limit and the event that closes next", async () => {
  await renderCard(buildLimits());

  expect(screen.getByText("1 of 2 active events")).toBeOnTheScreen();
  expect(screen.getByText("Free plan")).toBeOnTheScreen();
  expect(screen.getByRole("progressbar")).toHaveAccessibilityValue({ min: 0, max: 2, now: 1 });
  expect(screen.getByText("Next to close")).toBeOnTheScreen();
  expect(screen.getByText("Book Club, Oct 20")).toBeOnTheScreen();
});

test("leaves out the next event when none is set to close", async () => {
  await renderCard(buildLimits({ usage: { activeEvents: 0 }, nextClosingEvent: null }));

  expect(screen.getByText("0 of 2 active events")).toBeOnTheScreen();
  expect(screen.getByRole("progressbar")).toHaveAccessibilityValue({ now: 0 });
  expect(screen.queryByText("Next to close")).not.toBeOnTheScreen();
});

test("keeps the bar full when the count is past the limit", async () => {
  await renderCard(buildLimits({ usage: { activeEvents: 3 } }));

  expect(screen.getByText("3 of 2 active events")).toBeOnTheScreen();
  expect(screen.getByRole("progressbar")).toHaveAccessibilityValue({ max: 2, now: 2 });
});

test.each([
  [1, "1 active event"],
  [3, "3 active events"],
])("counts %s without a bar on a plan with no limit", async (activeEvents, text) => {
  await renderCard(buildLimits({ limits: { activeEvents: null }, usage: { activeEvents } }));

  expect(screen.getByText(text)).toBeOnTheScreen();
  expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
});

test("shows a spinner while loading", async () => {
  await render(<ActiveEventsCard isLoading isError={false} isFetching onRetry={jest.fn()} />);

  expect(screen.getByLabelText("Loading active events")).toBeOnTheScreen();
});

test("shows retry on failure without inventing counts", async () => {
  const retry = jest.fn();
  await render(<ActiveEventsCard isLoading={false} isError isFetching={false} onRetry={retry} />);

  expect(screen.getByRole("alert")).toHaveTextContent("Could not refresh your active events.");
  expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
