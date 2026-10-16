import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen } from "@testing-library/react-native";
import { buildEvent } from "../testing/fixtures";
import { RollCard } from "./roll-card";

const NOW = new Date("2026-10-16T12:00:00.000Z");

test("circles the time left on a roll closing within the day, and opens on press", async () => {
  const onPress = jest.fn();
  const event = buildEvent({
    title: "Sam & Jo’s wedding",
    galleryState: "OPEN",
    galleryClosesAt: "2026-10-16T17:42:00.000Z",
    usage: { members: 24, storageBytes: "0" },
  });

  await renderWithI18n(<RollCard event={event} onPress={onPress} now={NOW} />);

  expect(screen.getByText("Sam & Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("5h 42m left")).toBeOnTheScreen();
  expect(screen.getByText("24 on the roll")).toBeOnTheScreen();

  fireEvent.press(screen.getByLabelText("Sam & Jo’s wedding, 5h 42m left"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("shows how long an open roll stays open on the right", async () => {
  const event = buildEvent({
    title: "Nadia turns 30",
    galleryState: "OPEN",
    galleryClosesAt: "2026-11-21T00:00:00.000Z",
    coverUrl: null,
    usage: { members: 18, storageBytes: "0" },
  });

  await renderWithI18n(<RollCard event={event} now={NOW} />);

  expect(screen.getByText("18 on the roll")).toBeOnTheScreen();
  expect(screen.getByText(/^Until /)).toBeOnTheScreen();
});

test("marks an upcoming roll as unexposed with when it opens", async () => {
  const event = buildEvent({
    title: "Friday at Sully’s",
    galleryState: "UPCOMING",
    galleryOpensAt: "2026-10-23T21:00:00.000Z",
    usage: { members: 11, storageBytes: "0" },
  });

  await renderWithI18n(<RollCard event={event} now={NOW} />);

  expect(screen.getByText("Friday at Sully’s")).toBeOnTheScreen();
  expect(screen.getByText("Unexposed · 11 in")).toBeOnTheScreen();
  expect(screen.getByText(/^Opens /)).toBeOnTheScreen();
});

test("shows when a closed roll's photos went", async () => {
  const event = buildEvent({
    title: "Lake weekend",
    galleryState: "CLOSED",
    galleryClosesAt: "2026-09-21T00:00:00.000Z",
    deactivatedAt: null,
    usage: { members: 11, storageBytes: "0" },
  });

  await renderWithI18n(<RollCard event={event} now={NOW} />);

  expect(screen.getByText("11 on the roll")).toBeOnTheScreen();
  expect(screen.getByText(/^Closed /)).toBeOnTheScreen();
});
