import { subject } from "@casl/ability";
import { ForbiddenException } from "@nestjs/common";
import { AccessLevel, Event } from "generated/prisma/client";
import { mockDeep } from "jest-mock-extended";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { resolveApiErrorMessage } from "src/common/errors/api-error-codes";
import { ApiException } from "src/common/errors/api.exception";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "src/events/events.abilities";
import { PHOTO_ACTIONS, PHOTO_SUBJECT } from "src/photos/photos.abilities";
import { PrismaService } from "src/prisma/prisma.service";
import { AbilityFactory } from "./ability.factory";
import { authorize } from "./authorize";

describe("authorize", () => {
  const callerId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const factory = new AbilityFactory(mockDeep<PrismaService>());
  const onboarded = factory.createForUser({ id: callerId, isOnboarded: true });
  const notOnboarded = factory.createForUser({ id: callerId, isOnboarded: false });

  /** The event as a CASL subject, with the caller's access row if they have one. */
  const eventFor = (accessLevel: AccessLevel | null) =>
    subject(EVENT_SUBJECT, {
      id: eventId,
      creatorId: null,
      eventAccesses: accessLevel ? [{ userId: callerId, eventId, accessLevel }] : [],
    } as unknown as Event);

  const refusalOf = (check: () => void): unknown => {
    try {
      check();
    } catch (error) {
      return error;
    }
    return null;
  };

  it("lets the caller through when the ability allows the action", () => {
    expect(refusalOf(() => authorize(onboarded, EVENT_ACTIONS.UPDATE, eventFor(AccessLevel.ORGANIZER)))).toBeNull();
  });

  it("tells a member whose role doesn't allow it which role it needs, naming the action in the reason", () => {
    const refusal = refusalOf(() =>
      authorize(onboarded, EVENT_ACTIONS.UPDATE, eventFor(AccessLevel.PARTICIPANT), {
        isMember: true,
        refusal: "ORGANIZER_ONLY",
      }),
    );

    expect(refusal).toBeInstanceOf(ApiException);
    expect(refusal).toMatchObject({
      status: 403,
      response: {
        code: "ORGANIZER_ONLY",
        message: resolveApiErrorMessage("ORGANIZER_ONLY", { action: "update", subject: "Event" }),
      },
    });
  });

  it("tells a viewer that viewers can't add photos", () => {
    const prospectivePhoto = subject(PHOTO_SUBJECT, {
      eventId,
      addedById: callerId,
      event: { eventAccesses: [{ userId: callerId, eventId, accessLevel: AccessLevel.VIEWER }] },
    } as never);

    const refusal = refusalOf(() =>
      authorize(onboarded, PHOTO_ACTIONS.CREATE, prospectivePhoto, { isMember: true, refusal: "VIEWER_CANNOT_UPLOAD" }),
    );

    expect(refusal).toMatchObject({ status: 403, response: { code: "VIEWER_CANNOT_UPLOAD" } });
  });

  it("gives a caller with no access the bare 403, whose message is only the reason it logs", () => {
    const refusal = refusalOf(() =>
      authorize(onboarded, EVENT_ACTIONS.UPDATE, eventFor(null), { isMember: false, refusal: "ORGANIZER_ONLY" }),
    );

    expect(refusal).toBeInstanceOf(ForbiddenException);
    expect(refusal).toEqual(new ForbiddenException(RESPONSE_TEMPLATES.ACCESS_DENIED("update", "Event")));
  });

  it("gives the bare 403 when no member refusal applies, whatever the caller's role", () => {
    expect(refusalOf(() => authorize(onboarded, EVENT_ACTIONS.UPDATE, eventFor(AccessLevel.VIEWER)))).toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("doesn't blame the role of a member who hasn't onboarded, who has no permissions at all", () => {
    const refusal = refusalOf(() =>
      authorize(notOnboarded, EVENT_ACTIONS.UPDATE, eventFor(AccessLevel.ORGANIZER), {
        isMember: true,
        refusal: "ORGANIZER_ONLY",
      }),
    );

    expect(refusal).toBeInstanceOf(ForbiddenException);
  });

  it("names a subject type passed as a string", () => {
    expect(refusalOf(() => authorize(notOnboarded, EVENT_ACTIONS.CREATE, EVENT_SUBJECT))).toEqual(
      new ForbiddenException(RESPONSE_TEMPLATES.ACCESS_DENIED("create", "Event")),
    );
  });
});
