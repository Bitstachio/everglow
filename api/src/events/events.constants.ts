import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const entity = "User";

export const EVENT_SERVICE_ERRORS = {
  CREATOR_NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(entity, "ID", id),
};
