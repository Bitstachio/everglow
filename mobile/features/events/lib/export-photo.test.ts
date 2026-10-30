import { buildPhoto } from "../testing/fixtures";
import { downloadExportPhoto } from "./export-photo";

const mockDownload = jest.fn();
const mockDelete = jest.fn();
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file://cache" },
  File: Object.assign(
    jest.fn().mockImplementation((root: string, name: string) => ({ uri: `${root}/${name}`, delete: mockDelete })),
    {
      downloadFileAsync: (...args: unknown[]) => mockDownload(...args),
    },
  ),
}));
beforeEach(() => jest.clearAllMocks());

test("failed downloads reclaim their destination, including partially written Android files", async () => {
  mockDownload.mockRejectedValueOnce(new Error("connection lost"));
  await expect(downloadExportPhoto(buildPhoto())).rejects.toThrow("connection lost");
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("two exports of the same photo never share a temporary destination", async () => {
  mockDownload.mockImplementation(async (_url: string, file: { uri: string }) => file);
  const [first, second] = await Promise.all([downloadExportPhoto(buildPhoto()), downloadExportPhoto(buildPhoto())]);
  expect(first.uri).not.toBe(second.uri);
  expect(first.uri).toMatch(/\.jpg$/);
  expect(second.uri).toMatch(/\.jpg$/);
});
