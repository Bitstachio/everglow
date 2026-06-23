import { Gallery } from "generated/prisma/client";
import { GalleryResponseDto } from "../dto/gallery-response.dto";

export class GalleryMapper {
  static toResponseDto(gallery: Gallery): GalleryResponseDto {
    return {
      id: gallery.id,
      eventId: gallery.eventId,
      name: gallery.name,
      createdAt: gallery.createdAt,
      updatedAt: gallery.updatedAt,
    };
  }

  static toResponseDtoList(galleries: Gallery[]): GalleryResponseDto[] {
    return galleries.map((gallery) => GalleryMapper.toResponseDto(gallery));
  }
}
