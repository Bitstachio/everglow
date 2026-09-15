import { ApiPropertyOptional } from "@nestjs/swagger";
import { AccountDeletionPhotoPolicy } from "generated/prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { DEFAULT_ACCOUNT_DELETION_PHOTO_POLICY } from "../users.constants";

export class DeleteAccountQueryDto {
  @ApiPropertyOptional({
    enum: AccountDeletionPhotoPolicy,
    default: DEFAULT_ACCOUNT_DELETION_PHOTO_POLICY,
    description:
      "What happens to photos the account uploaded into events that outlive it. " +
      "KEEP: they stay in the event with no uploader. DELETE: they are removed everywhere. " +
      "Uploads still in progress are always discarded. The choice is stored with the deletion " +
      "intent, so a resumed saga honours it.",
  })
  @IsOptional()
  @IsEnum(AccountDeletionPhotoPolicy)
  photos?: AccountDeletionPhotoPolicy;
}
