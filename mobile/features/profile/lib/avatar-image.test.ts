import { AVATAR_MAX_DIMENSION, prepareAvatarImage } from "./avatar-image";

const mockContext = {
  crop: jest.fn(),
  resize: jest.fn(),
  renderAsync: jest.fn(),
  release: jest.fn(),
};
const mockImage = { saveAsync: jest.fn(), release: jest.fn() };
const mockManipulate = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
  SaveFormat: { JPEG: "jpeg" },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockManipulate.mockReturnValue(mockContext);
  mockContext.renderAsync.mockResolvedValue(mockImage);
  mockImage.saveAsync.mockResolvedValue({ uri: "file://avatar.jpg", width: 1024, height: 1024 });
});

test("re-encodes a HEIC photo as JPEG", async () => {
  await expect(prepareAvatarImage({ uri: "file://IMG_0001.HEIC", width: 800, height: 800 })).resolves.toEqual({
    uri: "file://avatar.jpg",
    contentType: "image/jpeg",
  });
  expect(mockManipulate).toHaveBeenCalledWith("file://IMG_0001.HEIC");
  expect(mockImage.saveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.8 });
  expect(mockContext.crop).not.toHaveBeenCalled();
  expect(mockContext.resize).not.toHaveBeenCalled();
});

test("centre-crops to a square and downscales a large photo", async () => {
  await prepareAvatarImage({ uri: "file://photo.jpg", width: 4032, height: 3024 });
  expect(mockContext.crop).toHaveBeenCalledWith({ originX: 504, originY: 0, width: 3024, height: 3024 });
  expect(mockContext.resize).toHaveBeenCalledWith({ width: AVATAR_MAX_DIMENSION, height: AVATAR_MAX_DIMENSION });
});

test("releases native images even when saving fails", async () => {
  mockImage.saveAsync.mockRejectedValue(new Error("disk full"));
  await expect(prepareAvatarImage({ uri: "file://photo.jpg", width: 100, height: 100 })).rejects.toThrow("disk full");
  expect(mockImage.release).toHaveBeenCalled();
  expect(mockContext.release).toHaveBeenCalled();
});
