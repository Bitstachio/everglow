import { detectSubjectType } from "@casl/ability";
import { ForbiddenException } from "@nestjs/common";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { ApiException } from "src/common/errors/api.exception";
import { AppAbility, AppAction, AppSubjects } from "./ability.types";

/**
 * What a caller who is a member of the event, but whose role doesn't allow the
 * action, is told instead of the bare 403 (docs/api-exceptions.md).
 */
export interface MemberRefusal {
  /** Whether the caller is a member of the event the action is on. */
  isMember: boolean;
  refusal: "ORGANIZER_ONLY" | "VIEWER_CANNOT_UPLOAD";
}

/**
 * Runs a CASL check and refuses when it fails. This is the only place a bare
 * 403 comes from, and lint keeps `ForbiddenException` to this file: a caller
 * with no access to the event learns nothing more than `FORBIDDEN`. A member
 * whose role doesn't allow the action gets a code the app can explain, from
 * `memberRefusal`. Any other refusal is an `ApiException` with its own code.
 */
export const authorize = (
  ability: AppAbility,
  action: AppAction,
  target: AppSubjects,
  memberRefusal?: MemberRefusal,
): void => {
  if (ability.can(action, target)) return;

  const subjectName = typeof target === "string" ? target : String(detectSubjectType(target));
  // A member with no rules at all hasn't onboarded, so their role isn't why;
  // they get the bare 403 like any caller without access.
  if (memberRefusal?.isMember && ability.rules.length > 0) {
    throw memberRefusal.refusal === "ORGANIZER_ONLY"
      ? new ApiException("ORGANIZER_ONLY", { action, subject: subjectName })
      : new ApiException("VIEWER_CANNOT_UPLOAD");
  }
  // The reason only reaches the request's log line; the client gets FORBIDDEN.
  throw new ForbiddenException(RESPONSE_TEMPLATES.ACCESS_DENIED(action, subjectName));
};
