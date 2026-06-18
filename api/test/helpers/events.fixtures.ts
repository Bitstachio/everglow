import { AccessLevel, Event, EventAccess, Prisma } from "generated/prisma/client";
import { CreateEventDto } from "src/events/dto/create-event.dto";
import { UpdateEventDto } from "src/events/dto/update-event.dto";
import { buildInvitationUrl } from "src/events/events.invitation";
import { eventAccessWithUserInclude } from "src/events/events.types";
import { UserWithDetails } from "src/users/users.types";
import { TEST_NOW, TEST_USER_ID, buildUserWithDetails } from "./users.fixtures";
import { TEST_OTHER_USER_ID, TEST_TARGET_USER_ID } from "./auth.fixtures";

export const TEST_EVENT_ID = "66666666-6666-6666-6666-666666666666";
export const TEST_OTHER_EVENT_ID = "77777777-7777-7777-7777-777777777777";
export const TEST_INVITE_TOKEN = "invite-created";
export const TEST_OTHER_INVITE_TOKEN = "invite-access";

export const createEventPayload = (overrides: Partial<CreateEventDto> = {}): CreateEventDto => ({
  title: "Summer BBQ",
  date: "2026-08-15T18:00:00.000Z",
  ...overrides,
});

export const createEventPayloadWithDescription = (): CreateEventDto => ({
  ...createEventPayload(),
  description: "Bring a dish",
});

export const updateEventPayload = (overrides: Partial<UpdateEventDto> = {}): UpdateEventDto => ({
  title: "Updated Title",
  ...overrides,
});

export const buildEvent = (overrides: Partial<Event> = {}): Event => ({
  id: TEST_EVENT_ID,
  title: "Summer BBQ",
  description: null,
  date: new Date("2026-08-15T18:00:00.000Z"),
  creatorId: TEST_USER_ID,
  invitationUrl: TEST_INVITE_TOKEN,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

export const buildOtherUserEvent = (overrides: Partial<Event> = {}): Event => ({
  id: TEST_OTHER_EVENT_ID,
  title: "Other User Event",
  description: null,
  date: new Date("2026-09-01T18:00:00.000Z"),
  creatorId: TEST_OTHER_USER_ID,
  invitationUrl: TEST_OTHER_INVITE_TOKEN,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

export const buildOrganizerAccess = (overrides: Partial<EventAccess> = {}): EventAccess => ({
  id: "88888888-8888-8888-8888-888888888888",
  userId: TEST_USER_ID,
  eventId: TEST_EVENT_ID,
  accessLevel: AccessLevel.ORGANIZER,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

export const buildParticipantAccess = (overrides: Partial<EventAccess> = {}): EventAccess => ({
  ...buildOrganizerAccess(),
  id: "99999999-9999-9999-9999-999999999999",
  accessLevel: AccessLevel.PARTICIPANT,
  ...overrides,
});

export const buildViewerAccess = (overrides: Partial<EventAccess> = {}): EventAccess => ({
  ...buildOrganizerAccess(),
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  accessLevel: AccessLevel.VIEWER,
  ...overrides,
});

export const buildTargetParticipantAccess = (overrides: Partial<EventAccess> = {}): EventAccess => ({
  id: "10101010-1010-1010-1010-101010101010",
  userId: TEST_TARGET_USER_ID,
  eventId: TEST_EVENT_ID,
  accessLevel: AccessLevel.PARTICIPANT,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

export type EventAccessWithUser = Prisma.EventAccessGetPayload<{
  include: typeof eventAccessWithUserInclude;
}>;

export const buildEventAccessWithUser = (access: EventAccess, user: UserWithDetails): EventAccessWithUser => ({
  ...access,
  user,
});

export const eventWithCallerAccess = (event: Event, access: EventAccess[]) => ({
  ...event,
  eventAccesses: access,
});

export const buildOtherUserWithDetails = (overrides: Partial<UserWithDetails> = {}): UserWithDetails =>
  buildUserWithDetails({
    id: TEST_OTHER_USER_ID,
    providerSub: "auth0|e2e-other-user",
    details: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      userId: TEST_OTHER_USER_ID,
      email: "other@example.com",
      name: "Other User",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
    ...overrides,
  });

export const buildTargetUserWithDetails = (overrides: Partial<UserWithDetails> = {}): UserWithDetails =>
  buildUserWithDetails({
    id: TEST_TARGET_USER_ID,
    providerSub: "auth0|e2e-target-user",
    details: {
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      userId: TEST_TARGET_USER_ID,
      email: "target@example.com",
      name: "Target User",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
    ...overrides,
  });

export const expectedEventResponse = (event: Event) => ({
  id: event.id,
  title: event.title,
  description: event.description,
  date: event.date.toISOString(),
  creatorId: event.creatorId,
  invitationUrl: buildInvitationUrl(event.invitationUrl),
  createdAt: event.createdAt.toISOString(),
  updatedAt: event.updatedAt.toISOString(),
});
