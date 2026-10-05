/**
 * Debug-only messages for uncoded Nest HTTP exceptions. Clients never see
 * these; `AllExceptionsFilter` replaces them with the generic catalog message.
 * Pass the helper result into the exception — do not inline an equivalent string.
 */
export const RESPONSE_TEMPLATES = {
  RESOURCE: {
    NOT_FOUND: (entity: string, field: string, value: string | number) =>
      `${entity} with ${field} "${value}" not found`,
  },
  INVALID_FORMAT: (field: string, value: string) => `${field} "${value}" is not a valid format`,
  INVALID_VALUE: (field: string, value: string | number, expected: string) => `${field} "${value}" must be ${expected}`,
  ACCESS_DENIED: (action: string, subject: string) => `Caller may not ${action} this ${subject}`,
} as const;
