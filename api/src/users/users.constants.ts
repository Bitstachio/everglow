import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const entity = "User";

export const USER_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(entity, "ID", id),
  DETAILS_ALREADY_EXIST: (id: string) => `User with ID "${id}" has already completed onboarding`,
  EMAIL_TAKEN: (email: string) => RESPONSE_TEMPLATES.RESOURCE.ALREADY_EXISTS(entity, "email", email),
  ONBOARDING_INCOMPLETE: "Onboarding is incomplete. Please complete the user onboarding to continue.",
};
