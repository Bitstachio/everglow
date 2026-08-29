import { buildPhotoS3Key } from "src/photos/photos.constants";
import { PhotoMapper, PhotoWithUrl } from "./photo.mapper";

describe("PhotoMapper", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  const photo: PhotoWithUrl = {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    eventId: "66666666-6666-6666-6666-666666666666",
    addedById: "11111111-1111-1111-1111-111111111111",
    s3Key: buildPhotoS3Key(
      "11111111-1111-1111-1111-111111111111",
      "66666666-6666-6666-6666-666666666666",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ),
    contentType: "image/jpeg",
    sizeBytes: 1024,
    status: "READY",
    createdAt: now,
    updatedAt: now,
    url: "https://signed-get",
  };

  it("maps a photo to a response DTO without leaking the s3Key or status", () => {
    expect(PhotoMapper.toResponseDto(photo)).toEqual({
      id: photo.id,
      eventId: photo.eventId,
      addedById: photo.addedById,
      url: photo.url,
      contentType: photo.contentType,
      createdAt: photo.createdAt,
    });
  });

  it("maps a page of photos with the next cursor", () => {
    const result = PhotoMapper.toListResponseDto([photo], photo.id);

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(photo.id);
  });

  it("maps an empty page with a null cursor", () => {
    expect(PhotoMapper.toListResponseDto([], null)).toEqual({ items: [], nextCursor: null });
  });
});
