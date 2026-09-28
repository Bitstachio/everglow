import { DeleteOwnPhotosResponseDto } from "../dto/delete-own-photos-response.dto";
import { EventStorageUsageListResponseDto } from "../dto/event-storage-usage-list-response.dto";
import { OwnPhotoListResponseDto } from "../dto/own-photo-list-response.dto";
import { DeletedOwnPhotos, EventStorageUsage } from "../user-photos.service";
import { PhotoWithUrl } from "./photo.mapper";

export class UserPhotosMapper {
  static toUsageListResponseDto(rows: EventStorageUsage[]): EventStorageUsageListResponseDto {
    return { items: rows.map((row) => ({ ...row, bytes: row.bytes.toString() })) };
  }

  static toOwnPhotoListResponseDto(photos: PhotoWithUrl[], nextCursor: string | null): OwnPhotoListResponseDto {
    return {
      items: photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        contentType: photo.contentType,
        sizeBytes: photo.sizeBytes,
        createdAt: photo.createdAt,
      })),
      nextCursor,
    };
  }

  static toDeleteResponseDto(result: DeletedOwnPhotos): DeleteOwnPhotosResponseDto {
    return { photosDeleted: result.photosDeleted, bytesFreed: result.bytesFreed.toString() };
  }
}
