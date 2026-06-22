import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const galleryEntity = "Gallery";

export const DEFAULT_GALLERY_NAME = "Main";

export const GALLERY_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(galleryEntity, "ID", id),
  CREATE_FORBIDDEN: (eventId: string) => `Not authorized to create galleries in event with ID "${eventId}"`,
  READ_FORBIDDEN: (galleryId: string) => `Not authorized to read gallery with ID "${galleryId}"`,
  UPDATE_FORBIDDEN: (galleryId: string) => `Not authorized to update gallery with ID "${galleryId}"`,
  DELETE_FORBIDDEN: (galleryId: string) => `Not authorized to delete gallery with ID "${galleryId}"`,
};
