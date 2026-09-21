import { mockColorScheme } from "../testing/native-mocks";
import { render, screen, userEvent } from "@testing-library/react-native";
import { buildEvent } from "../testing/fixtures";
import EventsList from "./events-list";

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => ({ push: mockPush }),
    Link: ({
      href,
      children,
    }: {
      href: string;
      children: React.ReactElement<{ onPress?: () => void }>;
      asChild?: boolean;
    }) => React.cloneElement(children, { onPress: () => mockPush(href) }),
  };
});
beforeEach(() => {
  mockPush.mockReset();
  mockColorScheme.mockReturnValue("light");
});

test("shows loading without displaying stale cards or the empty state", async () => {
  await render(<EventsList title="Upcoming Events" isLoading events={[buildEvent()]} />);
  expect(screen.getByLabelText("Loading events")).toBeOnTheScreen();
  expect(screen.queryByText("Weekend meetup")).not.toBeOnTheScreen();
  expect(screen.queryByText("No events yet")).not.toBeOnTheScreen();
});

test.each(["light", "dark"])("shows empty-state guidance in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  await render(<EventsList title="Upcoming Events" isLoading={false} events={[]} />);
  expect(screen.getByText("Upcoming Events")).toBeOnTheScreen();
  expect(screen.getByText("No events yet")).toBeOnTheScreen();
  expect(screen.getByText("Events you create or join will appear here")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Loading events")).not.toBeOnTheScreen();
});

test("opens the selected event detail route", async () => {
  await render(
    <EventsList
      title="Upcoming Events"
      isLoading={false}
      events={[buildEvent(), buildEvent({ id: "event-2", title: "Picnic" })]}
    />,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Open Picnic" }));
  expect(mockPush).toHaveBeenCalledWith("/events/event-2");
});

test("opens the events list route from See all", async () => {
  await render(<EventsList title="My Events" isLoading={false} events={[]} seeAllHref="/events/list" />);
  await userEvent.setup().press(screen.getByRole("link", { name: "See all events" }));
  expect(mockPush).toHaveBeenCalledWith("/events/list");
});

test("hides See all when no href is provided", async () => {
  await render(<EventsList title="My Events" isLoading={false} events={[]} />);
  expect(screen.queryByRole("link", { name: "See all events" })).not.toBeOnTheScreen();
});

test("only the creator can share and sharing does not navigate", async () => {
  const onShare = jest.fn();
  const event = buildEvent();
  await render(
    <EventsList
      title="Events"
      isLoading={false}
      currentUserId="user-1"
      onEventShare={onShare}
      events={[
        event,
        buildEvent({ id: "event-2", title: "Other event", creatorId: "user-2" }),
        buildEvent({ id: "event-3", title: "Deleted creator", creatorId: null }),
      ]}
    />,
  );
  expect(screen.queryByRole("button", { name: "Share Other event" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Share Deleted creator" })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Share Weekend meetup" }));
  expect(onShare).toHaveBeenCalledWith(event);
  expect(mockPush).not.toHaveBeenCalled();
});

test.each([undefined, "user-2"])("does not offer sharing for user %s", async (currentUserId) => {
  await render(
    <EventsList
      title="Events"
      isLoading={false}
      currentUserId={currentUserId}
      onEventShare={jest.fn()}
      events={[buildEvent()]}
    />,
  );
  expect(screen.queryByRole("button", { name: "Share Weekend meetup" })).not.toBeOnTheScreen();
});

test("does not offer sharing without a handler", async () => {
  await render(<EventsList title="Events" isLoading={false} currentUserId="user-1" events={[buildEvent()]} />);
  expect(screen.queryByRole("button", { name: "Share Weekend meetup" })).not.toBeOnTheScreen();
});
