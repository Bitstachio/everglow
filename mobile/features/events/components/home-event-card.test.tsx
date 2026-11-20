import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen } from "@testing-library/react-native";
import { buildEvent } from "../testing/fixtures";
import { HomeEventCard } from "./home-event-card";

const NOW = new Date("2026-10-16T12:00:00.000Z");

test("shows an open event's status, timing, counts, and opens on press", async () => {
  const onPress = jest.fn();
  const event = buildEvent({
    title: "Sam & Jo’s wedding",
    galleryState: "OPEN",
    galleryClosesAt: "2026-10-16T17:42:00.000Z",
    photoCount: 12,
    usage: { members: 24, storageBytes: "0" },
  });

  await renderWithI18n(<HomeEventCard event={event} onPress={onPress} now={NOW} />);

  expect(screen.getByText("Open")).toBeOnTheScreen();
  expect(screen.getByText("Sam & Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("5h 42m left")).toBeOnTheScreen();
  expect(screen.getByText("12 photos · 24 people")).toBeOnTheScreen();

  fireEvent.press(screen.getByLabelText("Sam & Jo’s wedding, 5h 42m left"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("marks an upcoming event with when it opens and leaves out photos", async () => {
  const event = buildEvent({
    title: "Friday at Sully’s",
    galleryState: "UPCOMING",
    galleryOpensAt: "2026-10-23T21:00:00.000Z",
    photoCount: 0,
    usage: { members: 11, storageBytes: "0" },
  });

  await renderWithI18n(<HomeEventCard event={event} now={NOW} />);

  expect(screen.getByText("Upcoming")).toBeOnTheScreen();
  expect(screen.getByText(/^Opens /)).toBeOnTheScreen();
  expect(screen.getByText("11 people")).toBeOnTheScreen();
  expect(screen.queryByText(/photos?/)).not.toBeOnTheScreen();
});

test("marks a closed event and leaves out photos", async () => {
  const event = buildEvent({
    title: "Lake weekend",
    galleryState: "CLOSED",
    galleryClosesAt: "2026-09-21T00:00:00.000Z",
    deactivatedAt: null,
    photoCount: 40,
    usage: { members: 11, storageBytes: "0" },
  });

  await renderWithI18n(<HomeEventCard event={event} now={NOW} />);

  expect(screen.getByText("Closed")).toBeOnTheScreen();
  expect(screen.getByText(/^Closed /)).toBeOnTheScreen();
  expect(screen.getByText("11 people")).toBeOnTheScreen();
  expect(screen.queryByText(/photos?/)).not.toBeOnTheScreen();
});

test("says when the list was loaded in place of the timing, offline", async () => {
  const event = buildEvent({
    title: "Nadia turns 30",
    galleryState: "OPEN",
    galleryClosesAt: "2026-10-16T17:42:00.000Z",
    usage: { members: 18, storageBytes: "0" },
  });

  await renderWithI18n(<HomeEventCard event={event} now={NOW} savedAt="21:40" />);

  expect(screen.getByText("as of 21:40")).toBeOnTheScreen();
  expect(screen.queryByText("5h 42m left")).not.toBeOnTheScreen();
});

test("shows the description on one line when there is one", async () => {
  const event = buildEvent({ description: "An afternoon with friends" });

  await renderWithI18n(<HomeEventCard event={event} now={NOW} />);

  expect(screen.getByText("An afternoon with friends", { exact: true })).toBeOnTheScreen();
});

test("keeps the card's line for the description empty when there is none", async () => {
  const event = buildEvent({ description: null });

  await renderWithI18n(<HomeEventCard event={event} now={NOW} />);

  expect(screen.queryByText("An afternoon with friends")).not.toBeOnTheScreen();
  expect(screen.getByLabelText(/^Weekend meetup, /)).toBeOnTheScreen();
});

test("shows a faint C in place of a cover that isn't there", async () => {
  await renderWithI18n(<HomeEventCard event={buildEvent({ coverUrl: null })} now={NOW} />);

  expect(screen.getByText("C")).toBeOnTheScreen();
});

test("has no letter when the event has a cover", async () => {
  await renderWithI18n(<HomeEventCard event={buildEvent({ coverUrl: "https://cdn/cover.jpg" })} now={NOW} />);

  expect(screen.queryByText("C")).not.toBeOnTheScreen();
});
