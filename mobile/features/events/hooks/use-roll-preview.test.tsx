import { renderHook } from "@testing-library/react-native";
import { buildEvent, buildPhoto } from "../testing/fixtures";
import { useRollPreview } from "./use-roll-preview";

const mockPreviewQuery = jest.fn();
jest.mock("../api/queries", () => ({ useRollPreviewQuery: (...args: unknown[]) => mockPreviewQuery(...args) }));
beforeEach(() => mockPreviewQuery.mockReset().mockReturnValue({ data: [buildPhoto()] }));

test("Home previews request thumbnails with a distinct cache identity", async () => {
  const { result } = await renderHook(() => useRollPreview(buildEvent({ galleryState: "OPEN" })));
  expect(result.current).toEqual([{ uri: buildPhoto().thumbnailUrl, cacheKey: "photo:photo-1:thumbnail" }]);
  expect(mockPreviewQuery).toHaveBeenCalledWith("event-1", 4, true);
});

test.each([
  { galleryState: "CLOSED" as const },
  { galleryState: "UPCOMING" as const },
  { galleryState: "OPEN" as const, status: "SUSPENDED" as const },
])("does not expose cached images when the roll is hidden: %o", async (state) => {
  const { result } = await renderHook(() => useRollPreview(buildEvent(state)));
  expect(result.current).toEqual([]);
  expect(mockPreviewQuery).toHaveBeenCalledWith("event-1", 4, false);
});
