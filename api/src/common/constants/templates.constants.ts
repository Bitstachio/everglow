/**
 * Centralized templates for standardized system responses.
 * Use with SCHEMA_LABELS to maintain consistency and avoid magic strings across modules.
 */
export const RESPONSE_TEMPLATES = {
  RESOURCE: {
    NOT_FOUND: (entity: string, field: string, value: string | number) =>
      `${entity} with ${field} "${value}" not found`,
    ALREADY_EXISTS: (entity: string, field: string, value: string | number) =>
      `${entity} with ${field} "${value}" already exists`,
  },
} as const;
