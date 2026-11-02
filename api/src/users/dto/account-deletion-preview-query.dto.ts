import { ApiPropertyOptional } from "@nestjs/swagger";
import { AccountDeletionPhotoPolicy } from "generated/prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class AccountDeletionPreviewQueryDto {
  @ApiPropertyOptional({
    enum: AccountDeletionPhotoPolicy,
    default: AccountDeletionPhotoPolicy.KEEP,
    description:
      "The photo choice to preview with. It can change an outcome: deleting the caller's photos also closes " +
      "the open reports on them, which may be all that keeps an event for review.",
  })
  @IsOptional()
  @IsEnum(AccountDeletionPhotoPolicy)
  photos?: AccountDeletionPhotoPolicy;
}
