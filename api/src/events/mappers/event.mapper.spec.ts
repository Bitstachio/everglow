import { AccessLevel, Event } from "generated/prisma/client";
import { EVENT_INVITATION_BASE_URL } from "../events.invitation";
import { EventParticipant } from "../events.types";
import { EventMapper } from "./event.mapper";

describe("EventMapper", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const inviteToken = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  const event: Event = {
    id: "66666666-6666-6666-6666-666666666666",
    title: "Summer BBQ",
    description: "Bring a dish",
    date: new Date("2026-09-15T18:00:00.000Z"),
    creatorId: "11111111-1111-1111-1111-111111111111",
    invitationUrl: inviteToken,
    coverS3Key: null,
    createdAt: now,
    updatedAt: now,
  };

  const participant: EventParticipant = {
    userId: "44444444-4444-4444-4444-444444444444",
    username: "target.user",
    name: "Target User",
    accessLevel: AccessLevel.PARTICIPANT,
    avatarUrl: "https://s3.example/avatar?sig=1",
  };

  describe("toResponseDto", () => {
    const coverUrl = "https://s3.example/cover?sig=1";

    it("maps event fields, composes the shareable invitation URL, and carries the presigned cover URL", () => {
      const result = EventMapper.toResponseDto(event, coverUrl);

      expect(result).toEqual({
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date,
        creatorId: event.creatorId,
        invitationUrl: `${EVENT_INVITATION_BASE_URL}/${inviteToken}`,
        coverUrl,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      });
    });

    it("reports a null coverUrl for an event without a cover", () => {
      expect(EventMapper.toResponseDto(event, null).coverUrl).toBeNull();
    });

    it("never exposes the cover's S3 key", () => {
      const coverS3Key = `event-covers/${event.id}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;

      const result = EventMapper.toResponseDto({ ...event, coverS3Key }, coverUrl);

      expect(JSON.stringify(result)).not.toContain(coverS3Key);
    });

    it("does not expose the raw invite token as the response invitationUrl", () => {
      const result = EventMapper.toResponseDto(event, null);

      expect(result.invitationUrl).not.toBe(inviteToken);
      expect(result.invitationUrl).toContain(inviteToken);
    });
  });

  describe("toParticipantResponseDto", () => {
    it("maps participant fields for the roster response", () => {
      const result = EventMapper.toParticipantResponseDto(participant);

      expect(result).toEqual({
        userId: participant.userId,
        username: participant.username,
        name: participant.name,
        accessLevel: participant.accessLevel,
        avatarUrl: participant.avatarUrl,
      });
    });
  });

  describe("toParticipantResponseDtoList", () => {
    it("maps each participant in the list", () => {
      const result = EventMapper.toParticipantResponseDtoList([
        participant,
        { ...participant, userId: "55555555-5555-5555-5555-555555555555", accessLevel: AccessLevel.VIEWER },
      ]);

      expect(result).toHaveLength(2);
      expect(result[1].accessLevel).toBe(AccessLevel.VIEWER);
    });
  });
});
