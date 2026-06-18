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
    createdAt: now,
    updatedAt: now,
  };

  const participant: EventParticipant = {
    userId: "44444444-4444-4444-4444-444444444444",
    name: "Target User",
    accessLevel: AccessLevel.PARTICIPANT,
  };

  describe("toResponseDto", () => {
    it("maps event fields and composes the shareable invitation URL", () => {
      const result = EventMapper.toResponseDto(event);

      expect(result).toEqual({
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date,
        creatorId: event.creatorId,
        invitationUrl: `${EVENT_INVITATION_BASE_URL}/${inviteToken}`,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      });
    });

    it("does not expose the raw invite token as the response invitationUrl", () => {
      const result = EventMapper.toResponseDto(event);

      expect(result.invitationUrl).not.toBe(inviteToken);
      expect(result.invitationUrl).toContain(inviteToken);
    });
  });

  describe("toResponseDtoList", () => {
    it("maps each event in the list", () => {
      const result = EventMapper.toResponseDtoList([event, { ...event, id: "77777777-7777-7777-7777-777777777777" }]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(event.id);
      expect(result[1].id).toBe("77777777-7777-7777-7777-777777777777");
    });
  });

  describe("toParticipantResponseDto", () => {
    it("maps participant fields for the roster response", () => {
      const result = EventMapper.toParticipantResponseDto(participant);

      expect(result).toEqual({
        userId: participant.userId,
        name: participant.name,
        accessLevel: participant.accessLevel,
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
