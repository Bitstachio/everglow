import { Photo } from "generated/prisma/client";
import { PhotoListResponseDto } from "../dto/photo-list-response.dto";
import { PhotoResponseDto } from "../dto/photo-response.dto";

export type PhotoWithUrl = Photo & { url: string };

export class PhotoMapper {
  static toResponseDto(photo: PhotoWithUrl): PhotoResponseDto {
    return {
      id: photo.id,
      eventId: photo.eventId,
      addedById: photo.addedById,
      url: photo.url,
      contentType: photo.contentType,
      createdAt: photo.createdAt,
    };
  }

  static toListResponseDto(photos: PhotoWithUrl[], nextCursor: string | null): PhotoListResponseDto {
    return {
      items: photos.map((photo) => PhotoMapper.toResponseDto(photo)),
      nextCursor,
    };
  }
}
