import { prepareImage } from "./prepare-image";

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

const wide = { aspect: [16, 9] as [number, number], maxWidth: 1920 };

beforeEach(() => {
  jest.clearAllMocks();
  mockManipulate.mockReturnValue(mockContext);
  mockContext.renderAsync.mockResolvedValue(mockImage);
  mockImage.saveAsync.mockResolvedValue({ uri: "file://prepared.jpg" });
});

test("re-encodes a photo already at the aspect without cropping or resizing", async () => {
  await expect(prepareImage({ uri: "file://IMG_0001.HEIC", width: 1280, height: 720 }, wide)).resolves.toEqual({
    uri: "file://prepared.jpg",
    contentType: "image/jpeg",
  });
  expect(mockImage.saveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.8 });
  expect(mockContext.crop).not.toHaveBeenCalled();
  expect(mockContext.resize).not.toHaveBeenCalled();
});

test("crops a 4:3 photo to a centred 16:9 band and downscales it", async () => {
  await prepareImage({ uri: "file://photo.jpg", width: 4032, height: 3024 }, wide);
  expect(mockContext.crop).toHaveBeenCalledWith({ originX: 0, originY: 378, width: 4032, height: 2268 });
  expect(mockContext.resize).toHaveBeenCalledWith({ width: 1920, height: 1080 });
});

test("crops a panorama to a centred 16:9 window", async () => {
  await prepareImage({ uri: "file://pano.jpg", width: 8000, height: 2000 }, wide);
  expect(mockContext.crop).toHaveBeenCalledWith({ originX: 2222, originY: 0, width: 3556, height: 2000 });
});

test("releases native images even when saving fails", async () => {
  mockImage.saveAsync.mockRejectedValue(new Error("disk full"));
  await expect(prepareImage({ uri: "file://photo.jpg", width: 160, height: 90 }, wide)).rejects.toThrow("disk full");
  expect(mockImage.release).toHaveBeenCalled();
  expect(mockContext.release).toHaveBeenCalled();
});
