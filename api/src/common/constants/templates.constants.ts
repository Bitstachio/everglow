/**
 * Debug-only messages for uncoded Nest HTTP exceptions. Clients never see
 * these; `AllExceptionsFilter` replaces them with the generic catalog message.
 * Pass the helper result into the exception — do not inline an equivalent string.
 */
export const RESPONSE_TEMPLATES = {
  RESOURCE: {
    NOT_FOUND: (entity: string, field: string, value: string | number) =>
      `${entity} with ${field} "${value}" not found`,
    ALREADY_EXISTS: (entity: string, field: string, value: string | number) =>
      `${entity} with ${field} "${value}" already exists`,
  },
  INVALID_FORMAT: (field: string, value: string) => `${field} "${value}" is not a valid format`,
} as const;
