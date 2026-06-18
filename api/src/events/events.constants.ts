import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const userEntity = "User";
const eventEntity = "Event";

export const EVENT_SERVICE_ERRORS = {
  CREATOR_NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(userEntity, "ID", id),
  CALLER_NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(userEntity, "ID", id),
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(eventEntity, "ID", id),
  INVITATION_NOT_FOUND: (invitationUrl: string) => `Event with invitation URL "${invitationUrl}" not found`,
  ALREADY_JOINED: (eventId: string) => `User has already joined event with ID "${eventId}"`,
  CREATE_FORBIDDEN: "Not authorized to create events",
  DELETE_FORBIDDEN: (eventId: string) => `Not authorized to delete event with ID "${eventId}"`,
  UPDATE_FORBIDDEN: (eventId: string) => `Not authorized to update event with ID "${eventId}"`,
  READ_FORBIDDEN: (eventId: string) => `Not authorized to read event with ID "${eventId}"`,
  NOT_A_MEMBER: (eventId: string, userId: string) =>
    `User with ID "${userId}" is not a member of event with ID "${eventId}"`,
  LAST_ORGANIZER: (eventId: string) => `Event with ID "${eventId}" must have at least one organizer`,
  CANNOT_MODIFY_OWN_ACCESS: "Cannot change your own access level; use leaveEvent instead",
  CANNOT_REMOVE_SELF: "Use leaveEvent to remove yourself from an event",
};
