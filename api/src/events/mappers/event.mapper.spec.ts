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
    coverUpdatedById: null,
    underReviewAt: null,
    plan: "FREE",
    galleryClosesAt: null,
    galleryClosedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const participant: EventParticipant = {
    userId: "44444444-4444-4444-4444-444444444444",
    username: "target.user",
    name: "Target User",
    accessLevel: AccessLevel.PARTICIPANT,
    avatarUrl: "https://s3.example/avatar?sig=1",
    isBlockedByCaller: true,
  };

  describe("toResponseDto", () => {
    const coverUrl = "https://s3.example/cover?sig=1";
    const usage = { members: 4, storageBytes: 1288490188n };

    it("maps event fields, composes the shareable invitation URL, and carries the presigned cover URL", () => {
      const result = EventMapper.toResponseDto(event, coverUrl, usage);

      expect(result).toEqual({
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date,
        creatorId: event.creatorId,
        invitationUrl: `${EVENT_INVITATION_BASE_URL}/${inviteToken}`,
        invites: [],
        coverUrl,
        status: "ACTIVE",
        plan: "FREE",
        galleryState: "OPEN",
        galleryClosesAt: null,
        limits: { members: 30, storageBytes: "3221225472" },
        usage: { members: 4, storageBytes: "1288490188" },
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      });
    });

    it("reports a CLOSED gallery once the close time has passed, and once the close job has run", () => {
      const past = new Date(Date.now() - 60_000);

      expect(EventMapper.toResponseDto({ ...event, galleryClosesAt: past }, null, usage).galleryState).toBe("CLOSED");
      expect(EventMapper.toResponseDto({ ...event, galleryClosedAt: past }, null, usage).galleryState).toBe("CLOSED");
      expect(
        EventMapper.toResponseDto({ ...event, galleryClosesAt: new Date(Date.now() + 60_000) }, null, usage)
          .galleryState,
      ).toBe("OPEN");
    });

    it("reports UNDER_REVIEW once the event is under review", () => {
      const underReview = { ...event, underReviewAt: new Date("2026-09-20T12:00:00.000Z") };

      expect(EventMapper.toResponseDto(underReview, coverUrl, usage).status).toBe("UNDER_REVIEW");
    });

    it("maps organizer invites into shareable URLs in role order", () => {
      const invites = [
        {
          id: "1",
          eventId: event.id,
          token: "org-token",
          accessLevel: AccessLevel.ORGANIZER,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "2",
          eventId: event.id,
          token: "viewer-token",
          accessLevel: AccessLevel.VIEWER,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "3",
          eventId: event.id,
          token: inviteToken,
          accessLevel: AccessLevel.PARTICIPANT,
          createdAt: now,
          updatedAt: now,
        },
      ];

      expect(EventMapper.toResponseDto(event, null, usage, invites).invites).toEqual([
        { accessLevel: AccessLevel.PARTICIPANT, invitationUrl: `${EVENT_INVITATION_BASE_URL}/${inviteToken}` },
        { accessLevel: AccessLevel.VIEWER, invitationUrl: `${EVENT_INVITATION_BASE_URL}/viewer-token` },
        { accessLevel: AccessLevel.ORGANIZER, invitationUrl: `${EVENT_INVITATION_BASE_URL}/org-token` },
      ]);
    });

    it("reports a null coverUrl for an event without a cover", () => {
      expect(EventMapper.toResponseDto(event, null, usage).coverUrl).toBeNull();
    });

    it("never exposes the cover's S3 key", () => {
      const coverS3Key = `event-covers/${event.id}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;

      const result = EventMapper.toResponseDto({ ...event, coverS3Key }, coverUrl, usage);

      expect(JSON.stringify(result)).not.toContain(coverS3Key);
    });

    it("does not expose the raw invite token as the response invitationUrl", () => {
      const result = EventMapper.toResponseDto(event, null, usage);

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
        isBlockedByCaller: true,
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
