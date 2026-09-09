import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import type { AccountDeletionPhotoPolicy } from "../users.constants";
import { ACCOUNT_DELETION_PHOTO_POLICIES, DEFAULT_ACCOUNT_DELETION_PHOTO_POLICY } from "../users.constants";

export class DeleteAccountQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(ACCOUNT_DELETION_PHOTO_POLICIES),
    default: DEFAULT_ACCOUNT_DELETION_PHOTO_POLICY,
    description:
      "What happens to photos the account uploaded into events that outlive it. " +
      "keep: they stay in the event with no uploader. delete: they are removed everywhere. " +
      "Uploads still in progress are always discarded.",
  })
  @IsOptional()
  @IsIn(Object.values(ACCOUNT_DELETION_PHOTO_POLICIES))
  photos?: AccountDeletionPhotoPolicy;
}
