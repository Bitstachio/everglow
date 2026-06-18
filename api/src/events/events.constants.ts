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
};
