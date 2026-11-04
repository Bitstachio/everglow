import { ApiProperty } from "@nestjs/swagger";
import { ACCOUNT_DELETION_EVENT_OUTCOMES, type AccountDeletionEventOutcome } from "../users.constants";

export class AccountDeletionEventPreviewDto {
  @ApiProperty({ format: "uuid" })
  eventId: string;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiProperty({
    enum: ACCOUNT_DELETION_EVENT_OUTCOMES,
    enumName: "AccountDeletionEventOutcome",
    description:
      "DELETED: nobody else is in it, so it goes with its photos and cover. HANDED_OVER: the longest-standing " +
      "member becomes an organizer. KEPT_FOR_REVIEW: nobody else is in it, but it is under review or has open " +
      "reports that outlive the account, so it stays, without members, until the platform decides.",
  })
  outcome: AccountDeletionEventOutcome;
}

export class AccountDeletionPreviewResponseDto {
  @ApiProperty({
    type: [AccountDeletionEventPreviewDto],
    description:
      "The events the caller organizes alone, and what deleting the account now would do to each. Events with " +
      "another organizer are not listed: only the caller's membership goes.",
  })
  events: AccountDeletionEventPreviewDto[];
}
