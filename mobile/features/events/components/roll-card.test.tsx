import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen } from "@testing-library/react-native";
import { buildEvent } from "../testing/fixtures";
import { RollCard } from "./roll-card";

const NOW = new Date("2026-10-16T12:00:00.000Z");
// The strip is hidden from assistive tech; its frames are previews.
const HIDDEN = { includeHiddenElements: true };

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
  expect(screen.getByText("24 ppl")).toBeOnTheScreen();

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

  expect(screen.getByText("18 ppl")).toBeOnTheScreen();
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
  expect(screen.getByText("Unexposed · 11 ppl in")).toBeOnTheScreen();
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

  expect(screen.getByText("11 ppl")).toBeOnTheScreen();
  expect(screen.getByText(/^Closed /)).toBeOnTheScreen();
});

test("fills an open roll's strip with its first photos, then blank frames", async () => {
  const event = buildEvent({ galleryState: "OPEN", galleryClosesAt: "2026-11-21T00:00:00.000Z", coverUrl: null });

  await renderWithI18n(<RollCard event={event} now={NOW} photos={["https://cdn/a.jpg", "https://cdn/b.jpg"]} />);

  expect(screen.queryByText("01", HIDDEN)).not.toBeOnTheScreen();
  expect(screen.queryByText("02", HIDDEN)).not.toBeOnTheScreen();
  expect(screen.getByText("03", HIDDEN)).toBeOnTheScreen();
  expect(screen.getByText("04", HIDDEN)).toBeOnTheScreen();
});

test("shows the cover in the first frame until an open roll has photos", async () => {
  const event = buildEvent({
    galleryState: "OPEN",
    galleryClosesAt: "2026-11-21T00:00:00.000Z",
    coverUrl: "https://cdn/cover.jpg",
  });

  await renderWithI18n(<RollCard event={event} now={NOW} />);

  expect(screen.queryByText("01", HIDDEN)).not.toBeOnTheScreen();
  expect(screen.getByText("02", HIDDEN)).toBeOnTheScreen();
});
