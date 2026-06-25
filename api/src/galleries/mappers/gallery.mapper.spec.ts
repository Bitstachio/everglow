import { Gallery } from "generated/prisma/client";
import { GalleryMapper } from "./gallery.mapper";

describe("GalleryMapper", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  const gallery: Gallery = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    eventId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Main",
    createdAt: now,
    updatedAt: now,
  };

  describe("toResponseDto", () => {
    it("maps every gallery field onto the response shape", () => {
      const result = GalleryMapper.toResponseDto(gallery);

      expect(result).toEqual({
        id: gallery.id,
        eventId: gallery.eventId,
        name: gallery.name,
        createdAt: gallery.createdAt,
        updatedAt: gallery.updatedAt,
      });
    });
  });

  describe("toResponseDtoList", () => {
    it("maps each gallery in the list and preserves order", () => {
      const second: Gallery = {
        ...gallery,
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        name: "Behind the scenes",
      };

      const result = GalleryMapper.toResponseDtoList([gallery, second]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(gallery.id);
      expect(result[1].id).toBe(second.id);
      expect(result[1].name).toBe("Behind the scenes");
    });

    it("returns an empty array when given an empty list", () => {
      expect(GalleryMapper.toResponseDtoList([])).toEqual([]);
    });
  });
});
