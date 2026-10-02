import { fireEvent, render, screen } from "@testing-library/react-native";
import { EventCover, getEventCoverCacheKey } from "./event-cover";

const hidden = { includeHiddenElements: true };
const uri = "https://bucket.example.com/event-covers/event-1/upload-1?X-Amz-Signature=abc";

test("caches by event and uploaded object, not by the signed URL", () => {
  expect(getEventCoverCacheKey("event-1", uri)).toBe(
    "event-cover:event-1:https://bucket.example.com/event-covers/event-1/upload-1",
  );
  expect(getEventCoverCacheKey("event-1", uri.replace("abc", "def"))).toBe(getEventCoverCacheKey("event-1", uri));
});

test("shows the cover when there is one", async () => {
  await render(<EventCover eventId="event-1" uri={uri} />);
  expect(screen.getByTestId("event-cover-image", hidden)).toBeOnTheScreen();
});

test("renders nothing without a cover", async () => {
  await render(<EventCover eventId="event-1" uri={null} />);
  expect(screen.queryByTestId("event-cover-image", hidden)).toBeNull();
});

test("hides a cover that fails to load", async () => {
  await render(<EventCover eventId="event-1" uri={uri} />);
  await fireEvent(screen.getByTestId("event-cover-image", hidden), "error", { nativeEvent: { error: "expired" } });
  expect(screen.queryByTestId("event-cover-image", hidden)).toBeNull();
});
