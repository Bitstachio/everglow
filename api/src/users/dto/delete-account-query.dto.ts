import { ApiProperty } from "@nestjs/swagger";
import { AccountDeletionPhotoPolicy } from "generated/prisma/client";
import { IsEnum } from "class-validator";

export class DeleteAccountQueryDto {
  @ApiProperty({
    enum: AccountDeletionPhotoPolicy,
    description:
      "What happens to photos the account uploaded into events that outlive it. " +
      "KEEP: they stay in the event with no uploader. DELETE: they are removed everywhere. " +
      "Uploads still in progress are always discarded. The choice is stored with the deletion " +
      "intent, so a resumed saga honours it. Required: the two outcomes are both irreversible, " +
      "so a caller that omits it gets a 400 rather than a guess.",
  })
  @IsEnum(AccountDeletionPhotoPolicy)
  photos: AccountDeletionPhotoPolicy;
}
