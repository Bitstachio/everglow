import { ApiProperty } from "@nestjs/swagger";

export class EventResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty()
  date: Date;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description: "Who created the event; null once that account has been deleted. Not a permission: see accessLevel.",
  })
  creatorId: string | null;

  @ApiProperty({ description: "Shareable invitation link composed from the stored invite token" })
  invitationUrl: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
